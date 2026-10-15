import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { argsOf, fakeSupabase, methods, type Query, type Reply } from "@/test/fakeSupabase";

let sb: ReturnType<typeof fakeSupabase>;
let respond: (q: Query) => Reply;
vi.mock("@/lib/supabase/token", () => ({
  createTokenClient: () => sb.client,
}));

const { registerTools } = await import("@/lib/mcp/tools");

type Tool = {
  config: { inputSchema?: z.ZodType };
  handler: (...args: unknown[]) => Promise<CallToolResult>;
};
const tools = new Map<string, Tool>();
registerTools({
  registerTool: (name: string, config: Tool["config"], handler: Tool["handler"]) =>
    tools.set(name, { config, handler }),
} as never);

const authed = { http: { authInfo: { token: "tok", extra: { userId: "u1" } } } };

// Call a tool as the MCP server would: validate the input (filling defaults),
// then run the handler.
async function call(name: string, input?: unknown, ctx: unknown = authed) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  const res = tool.config.inputSchema
    ? await tool.handler(tool.config.inputSchema.parse(input ?? {}), ctx)
    : await tool.handler(ctx);
  const text = (res.content[0] as { text: string }).text;
  return { isError: res.isError ?? false, text, json: () => JSON.parse(text) };
}

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LIST = ID(1);

beforeEach(() => {
  respond = () => ({});
  sb = fakeSupabase((q) => respond(q));
});

describe("every tool", () => {
  it("refuses a caller without a verified token", async () => {
    const res = await call("list_households", undefined, {});
    expect(res).toMatchObject({ isError: true, text: "not authenticated" });
    expect(sb.queries).toEqual([]);
  });

  it("reports a database error as a tool error", async () => {
    respond = () => ({ error: { message: "permission denied for table lists" } });
    const res = await call("list_lists");
    expect(res).toMatchObject({ isError: true, text: "permission denied for table lists" });
  });

  it("answers { ok: true } when there is nothing to return", async () => {
    const res = await call("delete_list", { list_id: LIST });
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("list_households", () => {
  it("adds each household's members", async () => {
    respond = (q) =>
      q.table === "households"
        ? { data: [{ id: "h1" }, { id: "h2" }] }
        : { data: [{ user_id: `m-${(q.args as { p_household_id: string }).p_household_id}` }] };
    expect((await call("list_households")).json()).toEqual([
      { id: "h1", members: [{ user_id: "m-h1" }] },
      { id: "h2", members: [{ user_id: "m-h2" }] },
    ]);
  });
});

describe("create_list", () => {
  it("keeps store_name on a grocery list only", async () => {
    await call("create_list", { household_id: ID(9), name: "Rimi", store_name: "Rimi Ulmana" });
    await call("create_list", { household_id: ID(9), name: "Chores", type: "todo", store_name: "x" });
    expect(sb.queries.map((q) => argsOf(q, "insert")?.[0])).toEqual([
      { household_id: ID(9), name: "Rimi", type: "grocery", store_name: "Rimi Ulmana" },
      { household_id: ID(9), name: "Chores", type: "todo", store_name: null },
    ]);
  });
});

describe("get_items", () => {
  type Row = Record<string, unknown>;
  const row = (id: string, fields: Row = {}): Row => ({
    id,
    name: id,
    parent_item_id: null,
    checked_at: null,
    due_on: null,
    repeat_every: null,
    repeat_unit: null,
    repeat_from: null,
    item_reminders: [],
    ...fields,
  });

  function serve(list: Row | null, rows: Row[], timezone?: string) {
    respond = (q) => {
      if (q.table === "lists") return { data: list };
      if (q.table === "user_settings") return { data: timezone ? { timezone } : null };
      if (q.table === "list_items" && methods(q).includes("update")) return {};
      return { data: rows };
    };
  }
  const updates = () => sb.queries.filter((q) => methods(q).includes("update"));

  it("says when the list isn't there (or isn't theirs)", async () => {
    serve(null, []);
    expect(await call("get_items", { list_id: LIST })).toMatchObject({
      isError: true,
      text: "list not found",
    });
  });

  it("nests subtasks under their parent", async () => {
    serve({ id: LIST, type: "grocery" }, [
      row("p"),
      row("s1", { parent_item_id: "p" }),
      row("q"),
      row("s2", { parent_item_id: "p" }),
    ]);
    const { items } = (await call("get_items", { list_id: LIST })).json();
    expect(items.map((i: Row) => i.id)).toEqual(["p", "q"]);
    expect(items[0].subtasks.map((i: Row) => i.id)).toEqual(["s1", "s2"]);
    expect(items[1]).not.toHaveProperty("subtasks");
    expect(items[0]).not.toHaveProperty("item_reminders");
  });

  it("leaves out checked items when asked", async () => {
    serve({ id: LIST, type: "grocery" }, []);
    await call("get_items", { list_id: LIST });
    await call("get_items", { list_id: LIST, include_checked: false });
    const reads = sb.queries.filter((q) => q.table === "list_items");
    expect(argsOf(reads[0], "is")).toBeUndefined();
    expect(argsOf(reads[1], "is")).toEqual(["checked_at", null]);
  });

  it("doesn't roll over grocery lists", async () => {
    serve({ id: LIST, type: "grocery" }, []);
    await call("get_items", { list_id: LIST });
    expect(sb.queries.some((q) => q.table === "user_settings")).toBe(false);
  });

  describe("on a todo list", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      // 01:00 on 2026-10-16 in Riga.
      vi.setSystemTime(new Date("2026-10-15T22:00:00Z"));
      return () => vi.useRealTimers();
    });

    const daily = { repeat_every: 1, repeat_unit: "day", repeat_from: "completion" };

    it("reopens tasks that are due on the caller's own date", async () => {
      // Checked at 01:00 on the 15th in Riga, so back on the 16th there. In
      // UTC it was checked on the 14th, and it would be back on the 15th.
      serve(
        { id: LIST, type: "todo" },
        [
          row("t1", { ...daily, due_on: "2026-10-14", checked_at: "2026-10-14T22:00:00Z" }),
          row("t2", { ...daily, due_on: "2026-10-14", checked_at: "2026-10-14T22:00:00Z" }),
          row("s", { parent_item_id: "t1", checked_at: "2026-10-14T22:00:00Z" }),
        ],
        "Europe/Riga"
      );
      await call("get_items", { list_id: LIST });
      // Rows sharing a patch go out in one update.
      expect(updates().map((q) => [argsOf(q, "update")?.[0], argsOf(q, "in")])).toEqual([
        [{ due_on: "2026-10-16", checked_at: null, checked_by: null }, ["id", ["t1", "t2"]]],
        [{ checked_at: null, checked_by: null }, ["id", ["s"]]],
      ]);
    });

    it("uses UTC until the caller has a timezone", async () => {
      serve({ id: LIST, type: "todo" }, [
        row("t1", { ...daily, due_on: "2026-10-14", checked_at: "2026-10-14T22:00:00Z" }),
      ]);
      await call("get_items", { list_id: LIST });
      expect(argsOf(updates()[0], "update")?.[0]).toMatchObject({ due_on: "2026-10-15" });
    });

    it("writes nothing when nothing is due", async () => {
      serve({ id: LIST, type: "todo" }, [row("t1", { due_on: "2026-10-01" })], "Europe/Riga");
      await call("get_items", { list_id: LIST });
      expect(updates()).toEqual([]);
    });

    it("adds next_due_on to a checked repeating task, and remind to a dated one", async () => {
      serve(
        { id: LIST, type: "todo" },
        [
          row("t1", {
            ...daily,
            due_on: "2026-10-15",
            checked_at: "2026-10-15T21:30:00Z",
            item_reminders: [{ user_id: "u1" }, { user_id: "u2" }],
          }),
          row("t2"),
        ],
        "Europe/Riga"
      );
      const { items } = (await call("get_items", { list_id: LIST })).json();
      // 00:30 on the 16th in Riga: next is the 17th (on the 16th in UTC).
      expect(items[0]).toMatchObject({ next_due_on: "2026-10-17", remind: ["u1", "u2"] });
      expect(items[1]).not.toHaveProperty("next_due_on");
      expect(items[1]).not.toHaveProperty("remind");
    });
  });
});

describe("add_items", () => {
  it("maps repeat onto its columns and marks rows as the assistant's", async () => {
    respond = (q) =>
      q.rpc
        ? { data: (q.args as { p_user_ids: string[] }).p_user_ids }
        : { data: [{ id: "r1" }, { id: "r2" }] };
    const res = await call("add_items", {
      list_id: LIST,
      items: [
        {
          name: "Water plants",
          due_on: "2026-10-20",
          repeat: { every: 2, unit: "week" },
          remind: [ID(5)],
        },
        { name: "Milk" },
      ],
    });
    expect(argsOf(sb.queries[0], "insert")?.[0]).toEqual([
      {
        name: "Water plants",
        due_on: "2026-10-20",
        repeat_every: 2,
        repeat_unit: "week",
        repeat_from: "schedule",
        list_id: LIST,
        created_by: "u1",
        source: "assistant",
      },
      { name: "Milk", list_id: LIST, created_by: "u1", source: "assistant" },
    ]);
    // Reminders only for the item that asked, after the insert.
    expect(sb.queries.slice(1)).toMatchObject([
      { rpc: "set_item_reminders", args: { p_item_id: "r1", p_user_ids: [ID(5)] } },
    ]);
    expect(res.json()).toEqual([{ id: "r1", remind: [ID(5)] }, { id: "r2" }]);
  });

  it("rejects bad input before touching the database", async () => {
    await expect(call("add_items", { list_id: LIST, items: [] })).rejects.toThrow();
    await expect(
      call("add_items", { list_id: LIST, items: [{ name: "x", importance: 9 }] })
    ).rejects.toThrow();
    await expect(
      call("add_items", { list_id: LIST, items: [{ name: "x", due_on: "15.10.2026" }] })
    ).rejects.toThrow();
    expect(sb.queries).toEqual([]);
  });
});

describe("update_item", () => {
  const ITEM = ID(2);
  beforeEach(() => {
    respond = (q) => (q.rpc ? { data: ["u2"] } : { data: { id: ITEM } });
  });
  const patch = () => argsOf(sb.queries[0], "update")?.[0];

  it("needs something to update", async () => {
    expect(await call("update_item", { item_id: ITEM })).toMatchObject({
      isError: true,
      text: "nothing to update",
    });
    expect(sb.queries).toEqual([]);
  });

  it("writes only the fields given, and null clears one", async () => {
    await call("update_item", { item_id: ITEM, name: "Oat milk", notes: null });
    expect(patch()).toEqual({ name: "Oat milk", notes: null });
    expect(argsOf(sb.queries[0], "eq")).toEqual(["id", ITEM]);
  });

  it("sets a repeat", async () => {
    await call("update_item", {
      item_id: ITEM,
      repeat: { every: 3, unit: "day", from: "completion" },
    });
    expect(patch()).toEqual({ repeat_every: 3, repeat_unit: "day", repeat_from: "completion" });
  });

  it("clears the repeat with the due date", async () => {
    await call("update_item", { item_id: ITEM, due_on: null });
    expect(patch()).toEqual({
      due_on: null,
      repeat_every: null,
      repeat_unit: null,
      repeat_from: null,
    });
  });

  it("leaves the repeat alone when moving the due date", async () => {
    await call("update_item", { item_id: ITEM, due_on: "2026-11-01" });
    expect(patch()).toEqual({ due_on: "2026-11-01" });
  });

  it("can change only who is reminded", async () => {
    const res = await call("update_item", { item_id: ITEM, remind: [ID(7)] });
    expect(methods(sb.queries[0])).not.toContain("update");
    expect(sb.queries[1]).toMatchObject({
      rpc: "set_item_reminders",
      args: { p_item_id: ITEM, p_user_ids: [ID(7)] },
    });
    expect(res.json()).toEqual({ id: ITEM, remind: ["u2"] });
  });

  it("says when the item isn't there", async () => {
    respond = () => ({ data: null });
    expect(await call("update_item", { item_id: ITEM, name: "x" })).toMatchObject({
      isError: true,
      text: "item not found",
    });
  });
});

describe("set_items_checked", () => {
  it("stamps who checked and when, and clears both on uncheck", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T09:00:00Z"));
    await call("set_items_checked", { item_ids: [ID(3)], checked: true });
    vi.useRealTimers();
    await call("set_items_checked", { item_ids: [ID(3)], checked: false });
    expect(sb.queries.map((q) => argsOf(q, "update")?.[0])).toEqual([
      { checked_at: "2026-10-15T09:00:00.000Z", checked_by: "u1" },
      { checked_at: null, checked_by: null },
    ]);
  });
});

describe("list_templates", () => {
  it("lists each template's item names in their saved order", async () => {
    respond = () => ({
      data: [
        {
          id: "t",
          name: "Weekly",
          template_items: [
            { item_name: "eggs", sort_order: 2 },
            { item_name: "milk", sort_order: 0 },
            { item_name: "bread", sort_order: 1 },
          ],
        },
      ],
    });
    expect((await call("list_templates")).json()).toEqual([
      { id: "t", name: "Weekly", items: ["milk", "bread", "eggs"] },
    ]);
  });
});

describe("create_template", () => {
  it("saves the items in the order given", async () => {
    respond = (q) => (q.table === "templates" ? { data: { id: "t9" } } : {});
    const res = await call("create_template", {
      household_id: ID(9),
      name: "Weekly",
      items: ["milk", "bread"],
    });
    expect(res.json()).toEqual({ template_id: "t9" });
    expect(argsOf(sb.queries[1], "insert")?.[0]).toEqual([
      { template_id: "t9", item_name: "milk", sort_order: 0 },
      { template_id: "t9", item_name: "bread", sort_order: 1 },
    ]);
  });

  it("skips the item insert for an empty template", async () => {
    respond = () => ({ data: { id: "t9" } });
    await call("create_template", { household_id: ID(9), name: "Empty", items: [] });
    expect(sb.queries).toHaveLength(1);
  });
});

describe("apply_template", () => {
  const input = { template_id: ID(4), list_id: LIST };

  it("adds only names not already on the list", async () => {
    respond = (q) => {
      if (q.table === "template_items")
        return { data: [{ item_name: "Milk" }, { item_name: "Crème fraîche" }, { item_name: "Bread" }] };
      if (methods(q).includes("insert")) return { data: [{ id: "n1", name: "Bread" }] };
      return { data: [{ name: "  milk " }, { name: "creme  FRAICHE" }] };
    };
    const res = await call("apply_template", input);
    const insert = sb.queries.find((q) => methods(q).includes("insert"))!;
    expect(argsOf(insert, "insert")?.[0]).toEqual([
      { list_id: LIST, name: "Bread", created_by: "u1", source: "assistant" },
    ]);
    expect(res.json()).toEqual({ added: [{ id: "n1", name: "Bread" }] });
  });

  it("writes nothing when every name is already there", async () => {
    respond = (q) =>
      q.table === "template_items" ? { data: [{ item_name: "Milk" }] } : { data: [{ name: "milk" }] };
    expect((await call("apply_template", input)).json()).toEqual({ added: [] });
    expect(sb.queries.some((q) => methods(q).includes("insert"))).toBe(false);
  });
});

describe("grocery rpcs", () => {
  it("finish_trip records the trip", async () => {
    respond = () => ({ data: 4 });
    expect((await call("finish_trip", { list_id: LIST })).json()).toEqual({ cleared: 4 });
    expect(sb.queries[0]).toMatchObject({ rpc: "record_trip", args: { p_list_id: LIST } });
  });

  it("buy_again defaults to 12 suggestions", async () => {
    respond = () => ({ data: [] });
    await call("buy_again", { list_id: LIST });
    expect(sb.queries[0]).toMatchObject({ rpc: "buy_again", args: { p_list_id: LIST, p_limit: 12 } });
  });
});

describe("delete_items", () => {
  it("counts what was deleted", async () => {
    respond = () => ({ data: [{ id: "a" }, { id: "b" }] });
    expect((await call("delete_items", { item_ids: [ID(1), ID(2)] })).json()).toEqual({
      deleted: 2,
    });
  });
});
