import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { argsOf, fakeSupabase, methods, type Query, type Reply } from "@/test/fakeSupabase";
import type { Op } from "@/lib/outbox";
import type { Item } from "@/lib/useListItems";

// IndexedDB stand-in, shared with the module under test across resets.
const disk = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/idb", () => ({
  idbGet: async (key: string) => disk.get(key),
  idbSet: async (key: string, value: unknown) => {
    disk.set(key, value);
  },
}));

type Outbox = typeof import("@/lib/outbox");
type OpBody = Parameters<Outbox["enqueue"]>[0];

function item(id: string, fields: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    created_at: "2026-10-15T10:00:00Z",
    checked_at: null,
    checked_by: null,
    created_by: "u1",
    priority: null,
    price_cents: null,
    url: null,
    notes: null,
    importance: null,
    effort: null,
    parent_item_id: null,
    due_on: null,
    repeat_every: null,
    repeat_unit: null,
    repeat_from: null,
    ...fields,
  };
}

describe("applyOps", () => {
  let applyOps: Outbox["applyOps"];
  beforeEach(async () => {
    ({ applyOps } = await import("@/lib/outbox"));
  });

  const op = (body: OpBody): Op => ({ ...body, id: "op" });

  it("adds inserted rows for this list only, once", () => {
    const rows = [
      { ...item("a"), list_id: "L1" },
      { ...item("b"), list_id: "L2" },
    ];
    const ins = op({ kind: "insert", rows });
    const once = applyOps([], "L1", [ins]);
    expect(once.map((i) => i.id)).toEqual(["a"]);
    expect(applyOps(once, "L1", [ins])).toBe(once);
  });

  it("patches updated rows", () => {
    const items = [item("a"), item("b")];
    const out = applyOps(items, "L1", [
      op({ kind: "update", ids: ["b"], patch: { name: "milk" } }),
    ]);
    expect(out.map((i) => i.name)).toEqual(["a", "milk"]);
    expect(out[0]).toBe(items[0]);
  });

  it("removes deleted rows and their subtasks", () => {
    const items = [item("p"), item("s", { parent_item_id: "p" }), item("q")];
    const out = applyOps(items, "L1", [op({ kind: "delete", ids: ["p"] })]);
    expect(out.map((i) => i.id)).toEqual(["q"]);
  });

  it("removes what an rpc says it removes", () => {
    const items = [item("a"), item("b")];
    const trip = op({ kind: "rpc", fn: "record_trip", args: {}, removes: ["a"] });
    expect(applyOps(items, "L1", [trip]).map((i) => i.id)).toEqual(["b"]);
    const noop = op({ kind: "rpc", fn: "x", args: {} });
    expect(applyOps(items, "L1", [noop])).toBe(items);
  });

  it("applies ops in order", () => {
    const out = applyOps([], "L1", [
      op({ kind: "insert", rows: [{ ...item("a"), list_id: "L1" }] }),
      op({ kind: "update", ids: ["a"], patch: { checked_at: "2026-10-15T11:00:00Z" } }),
    ]);
    expect(out[0].checked_at).toBe("2026-10-15T11:00:00Z");
  });

  it("returns the same array when nothing applies", () => {
    const items = [item("a")];
    expect(
      applyOps(items, "L1", [
        op({ kind: "update", ids: ["zzz"], patch: { name: "x" } }),
        op({ kind: "delete", ids: ["zzz"] }),
      ])
    ).toBe(items);
  });
});

describe("the queue", () => {
  let outbox: Outbox;
  let win: EventTarget;
  let nav: { onLine: boolean };
  let respond: (q: Query) => Reply;
  let sb: ReturnType<typeof fakeSupabase>;
  let onApply: ReturnType<typeof vi.fn<(ops: Op[]) => void>>;
  let onReject: ReturnType<typeof vi.fn<() => void>>;
  let stop: () => void;

  // Let every pending promise chain run (the fake client answers in
  // microtasks); setImmediate isn't faked.
  const settle = () => new Promise((r) => setImmediate(r));

  async function start() {
    stop = outbox.startOutbox({
      supabase: sb.client as never,
      userId: "u1",
      onApply,
      onReject,
    });
    await settle();
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.resetModules();
    disk.clear();
    win = new EventTarget();
    nav = { onLine: true };
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
    vi.stubGlobal("navigator", nav);
    respond = () => ({});
    sb = fakeSupabase((q) => respond(q));
    onApply = vi.fn();
    onReject = vi.fn();
    outbox = await import("@/lib/outbox");
  });

  afterEach(() => {
    stop?.();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("applies a change at once and sends it", async () => {
    await start();
    const done = outbox.enqueue({ kind: "update", ids: ["a"], patch: { name: "milk" } });
    expect(onApply).toHaveBeenCalledWith([expect.objectContaining({ kind: "update", ids: ["a"] })]);
    expect(await done).toBe(true);

    expect(sb.queries).toHaveLength(1);
    const [q] = sb.queries;
    expect(q.table).toBe("list_items");
    expect(argsOf(q, "update")).toEqual([{ name: "milk" }]);
    expect(argsOf(q, "in")).toEqual(["id", ["a"]]);
    expect(outbox.pendingOps()).toEqual([]);
  });

  it("sends ops one at a time, in order", async () => {
    await start();
    const row = { ...item("a"), list_id: "L1" };
    await Promise.all([
      outbox.enqueue({ kind: "insert", rows: [row] }),
      outbox.enqueue({ kind: "update", ids: ["a"], patch: { checked_at: "x" } }),
      outbox.enqueue({ kind: "delete", ids: ["a"] }),
      outbox.enqueue({ kind: "rpc", fn: "record_trip", args: { p_list_id: "L1" } }),
    ]);
    expect(sb.queries.map((q) => q.rpc ?? methods(q)[0])).toEqual([
      "upsert",
      "update",
      "delete",
      "record_trip",
    ]);
    // A retried insert whose first reply got lost must not fail.
    expect(argsOf(sb.queries[0], "upsert")).toEqual([
      [row],
      { onConflict: "id", ignoreDuplicates: true },
    ]);
    expect(sb.queries[3].args).toEqual({ p_list_id: "L1" });
  });

  it("keeps a change on disk until the server has it", async () => {
    respond = () => ({ error: { message: "offline" }, status: 0 });
    await start();
    void outbox.enqueue({ kind: "delete", ids: ["a"] });
    await settle();
    expect(disk.get("outbox:u1")).toEqual([expect.objectContaining({ kind: "delete" })]);

    respond = () => ({});
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    expect(disk.get("outbox:u1")).toEqual([]);
  });

  it("sends ops left on disk first, and shows them", async () => {
    const saved: Op = { id: "old", kind: "delete", ids: ["a"] };
    disk.set("outbox:u1", [saved]);
    outbox.enqueue({ kind: "delete", ids: ["b"] });
    await start();
    expect(onApply).toHaveBeenCalledWith([saved]);
    expect(sb.queries.map((q) => argsOf(q, "in"))).toEqual([
      ["id", ["a"]],
      ["id", ["b"]],
    ]);
  });

  it("retries with backoff while the server can't be reached", async () => {
    let fail = 2;
    respond = () => (fail-- > 0 ? { error: { message: "down" }, status: 503 } : {});
    await start();
    const done = outbox.enqueue({ kind: "delete", ids: ["a"] });
    await settle();
    expect(sb.queries).toHaveLength(1);
    expect(outbox.pendingOps()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(sb.queries).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sb.queries).toHaveLength(2);

    // The delay doubles.
    await vi.advanceTimersByTimeAsync(3999);
    expect(sb.queries).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await done).toBe(true);
    expect(sb.queries).toHaveLength(3);
    expect(onReject).not.toHaveBeenCalled();
  });

  it("treats a thrown request as no connection", async () => {
    let fail = true;
    respond = () => {
      if (fail) {
        fail = false;
        throw new TypeError("fetch failed");
      }
      return {};
    };
    await start();
    const done = outbox.enqueue({ kind: "delete", ids: ["a"] });
    await settle();
    expect(outbox.pendingOps()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await done).toBe(true);
  });

  it.each([0, 401, 408, 429, 500, 503])("retries status %i", async (status) => {
    respond = () => ({ error: { message: "x" }, status });
    await start();
    void outbox.enqueue({ kind: "delete", ids: ["a"] });
    await settle();
    expect(outbox.pendingOps()).toHaveLength(1);
    expect(onReject).not.toHaveBeenCalled();
  });

  it("drops a change the server refuses and moves on", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    respond = (q) =>
      argsOf(q, "in")?.[1]?.toString() === "a"
        ? { error: { message: "violates row-level security" }, status: 403 }
        : {};
    await start();
    const refused = outbox.enqueue({ kind: "delete", ids: ["a"] });
    const next = outbox.enqueue({ kind: "delete", ids: ["b"] });
    expect(await refused).toBe(false);
    expect(await next).toBe(true);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(outbox.pendingOps()).toEqual([]);
  });

  it("waits for the browser to come online", async () => {
    nav.onLine = false;
    await start();
    const done = outbox.enqueue({ kind: "delete", ids: ["a"] });
    await settle();
    expect(sb.queries).toHaveLength(0);

    nav.onLine = true;
    win.dispatchEvent(new Event("online"));
    expect(await done).toBe(true);
    expect(sb.queries).toHaveLength(1);
  });

  it("keeps sent ops in the overlay for a while", async () => {
    await start();
    await outbox.enqueue({ kind: "delete", ids: ["a"] });
    expect(outbox.overlayOps()).toEqual([expect.objectContaining({ ids: ["a"] })]);
    vi.advanceTimersByTime(10_001);
    expect(outbox.overlayOps()).toEqual([]);
  });

  it("forgets everything on reset", async () => {
    respond = () => ({ error: { message: "offline" }, status: 0 });
    await start();
    const done = outbox.enqueue({ kind: "delete", ids: ["a"] });
    outbox.resetOutbox();
    expect(await done).toBe(false);
    expect(outbox.pendingOps()).toEqual([]);
    expect(outbox.overlayOps()).toEqual([]);
  });

  it("tracks which items are still being inserted", async () => {
    nav.onLine = false;
    await start();
    void outbox.enqueue({ kind: "insert", rows: [{ ...item("a"), list_id: "L1" }] });
    expect(outbox.isInserting("a")).toBe(true);
    expect(outbox.isInserting("b")).toBe(false);
    nav.onLine = true;
    win.dispatchEvent(new Event("online"));
    await settle();
    expect(outbox.isInserting("a")).toBe(false);
  });
});
