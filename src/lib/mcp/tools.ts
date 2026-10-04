import { z } from "zod";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { createTokenClient, type TokenClient } from "@/lib/supabase/token";
import { LIST_TYPES } from "@/lib/listTypes";
import { normalizeName } from "@/lib/categories";
import { localDate, nextDue, planRollover, type ItemPatch } from "@/lib/recurrence";

// Columns an MCP client sees for an item. Mirrors the Item type in
// src/lib/useListItems.ts minus the legacy `priority` flag.
const ITEM_COLUMNS =
  "id, name, notes, url, price_cents, importance, effort, parent_item_id, due_on, repeat_every, repeat_unit, repeat_from, created_at, checked_at";

type Session = { supabase: TokenClient; userId: string };

// Resolve the caller from the verified token (see verifyToken) and run `fn`
// as them. Any thrown error is reported to the model as a tool error rather
// than failing the whole MCP request.
async function run(
  ctx: ServerContext,
  fn: (session: Session) => Promise<unknown>
): Promise<CallToolResult> {
  try {
    const auth = ctx.http?.authInfo;
    const userId = auth?.extra?.userId;
    if (!auth || typeof userId !== "string") throw new Error("not authenticated");
    const data = await fn({ supabase: createTokenClient(auth.token), userId });
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? { ok: true }, null, 2) }],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
      isError: true,
    };
  }
}

type Result<T> = { data: T; error: { message: string } | null };

// Throw on a PostgREST error; for writes whose result we don't read.
function check({ error }: Result<unknown>): void {
  if (error) throw new Error(error.message);
}

// Unwrap a Supabase response, turning PostgREST errors (and a missing row from
// maybeSingle, which RLS also produces for other households' data) into
// exceptions.
function must<T>(res: Result<T>, notFound = "not found"): NonNullable<T> {
  check(res);
  if (res.data == null) throw new Error(notFound);
  return res.data;
}

const uuid = z.string().uuid();
const level = z.number().int().min(1).max(5);

// Optional item fields shared by add_items and update_item. Nullable so an
// update can clear a field.
const itemFields = {
  notes: z.string().max(2000).nullable().optional().describe("Free-text notes (todo/wishlist)."),
  url: z.string().max(2048).nullable().optional().describe("Link, mostly for wishlist items."),
  price_cents: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe("Price in euro cents, e.g. 1999 for €19.99 (wishlist)."),
  importance: level.nullable().optional().describe("1 (low) to 5 (high)."),
  effort: level
    .nullable()
    .optional()
    .describe("1 (easy/cheap) to 5 (hard/expensive). Reads as 'cost' on a wishlist."),
  due_on: z.iso
    .date()
    .nullable()
    .optional()
    .describe("Due date, YYYY-MM-DD (top-level todo items). Clearing it also clears repeat."),
  repeat: z
    .object({
      every: z.number().int().min(1).max(365),
      unit: z.enum(["day", "week"]),
      from: z
        .enum(["schedule", "completion"])
        .default("schedule")
        .describe(
          "schedule: keep to the calendar, skipping missed occurrences. completion: count from the day it was checked off."
        ),
    })
    .nullable()
    .optional()
    .describe("Make a todo repeat (needs due_on). When checked off it comes back on its next date."),
  remind: z
    .array(uuid)
    .max(50)
    .optional()
    .describe(
      "User ids to email on the due date (members from list_households); [] for nobody. A task that first gets a due_on defaults to the whole household."
    ),
};

type ItemFields = { due_on?: string | null; repeat?: RepeatInput | null; remind?: string[] };
type RepeatInput = { every: number; unit: "day" | "week"; from: "schedule" | "completion" };

// Map item fields onto columns: `remind` isn't a column (see setRemind), and
// the `repeat` object spreads into its three. A cleared due date takes the
// repeat with it, since a repeat counts from the due date.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropping remind
function itemColumns<T extends ItemFields>({ repeat, remind, ...rest }: T) {
  if (repeat === undefined && rest.due_on !== null) return rest;
  return {
    ...rest,
    repeat_every: repeat?.every ?? null,
    repeat_unit: repeat?.unit ?? null,
    repeat_from: repeat?.from ?? null,
  };
}

// Replace a task's reminder recipients. Runs after the item write, since a
// task's first due date defaults them to the whole household.
async function setRemind(supabase: TokenClient, itemId: string, userIds: string[]) {
  return must(
    await supabase.rpc("set_item_reminders", { p_item_id: itemId, p_user_ids: userIds })
  ) as string[];
}

// Apply planRollover's writes (rows sharing a patch go out together).
async function applyPatches(supabase: TokenClient, updates: ItemPatch[]) {
  const groups = new Map<string, string[]>();
  for (const u of updates) {
    const key = JSON.stringify(u.patch);
    groups.set(key, [...(groups.get(key) ?? []), u.id]);
  }
  for (const [key, ids] of groups) {
    check(await supabase.from("list_items").update(JSON.parse(key)).in("id", ids));
  }
}

const INSTRUCTIONS = `Listser is a shared household list app. A user belongs to one or more households; each household has lists of type "grocery", "todo" or "wishlist".
- Start with list_households / list_lists to find ids. list_households also lists each household's members.
- Grocery: check items off while shopping, then call finish_trip to clear checked items and teach the app the store's aisle order. buy_again suggests frequently bought items.
- Todo: items can have one level of subtasks (parent_item_id). Checked tasks stay as a record. Top-level tasks can have a due_on date and a repeat; a checked repeating task comes back unchecked on its next_due_on. remind lists the members emailed on the due date.
- Wishlist: price_cents, url, importance and effort (cost) describe wishes.
- Templates are reusable grocery item sets per household.`;

export const serverInstructions = INSTRUCTIONS;

export function registerTools(server: McpServer) {
  // ---- Households -----------------------------------------------------------

  server.registerTool(
    "list_households",
    {
      title: "List households",
      description:
        "List the households the user belongs to, with their invite codes and members (user_id, email).",
      annotations: { readOnlyHint: true },
    },
    (ctx) =>
      run(ctx, async ({ supabase }) => {
        const households = must(
          await supabase
            .from("households")
            .select("id, name, invite_code, created_at")
            .order("created_at")
        );
        return Promise.all(
          households.map(async (h) => ({
            ...h,
            members: must(
              await supabase.rpc("household_member_list", { p_household_id: h.id })
            ),
          }))
        );
      })
  );

  server.registerTool(
    "create_household",
    {
      title: "Create household",
      description: "Create a new household (with a default Groceries list) and join it.",
      inputSchema: z.object({ name: z.string().trim().min(1).max(80) }),
    },
    ({ name }, ctx) =>
      run(ctx, async ({ supabase }) => ({
        household_id: must(await supabase.rpc("create_household", { p_name: name })),
      }))
  );

  server.registerTool(
    "join_household",
    {
      title: "Join household",
      description: "Join a household using its invite code.",
      inputSchema: z.object({ invite_code: z.string().trim().min(1) }),
    },
    ({ invite_code }, ctx) =>
      run(ctx, async ({ supabase }) => ({
        household_id: must(await supabase.rpc("join_household", { p_code: invite_code })),
      }))
  );

  // ---- Lists ----------------------------------------------------------------

  server.registerTool(
    "list_lists",
    {
      title: "List lists",
      description: "List the user's lists, optionally limited to one household.",
      inputSchema: z.object({ household_id: uuid.optional() }),
      annotations: { readOnlyHint: true },
    },
    ({ household_id }, ctx) =>
      run(ctx, async ({ supabase }) => {
        let query = supabase
          .from("lists")
          .select("id, household_id, name, type, store_name, created_at")
          .order("created_at");
        if (household_id) query = query.eq("household_id", household_id);
        return must(await query);
      })
  );

  server.registerTool(
    "create_list",
    {
      title: "Create list",
      description:
        "Create a list in a household. store_name only applies to grocery lists (each store learns its own aisle order).",
      inputSchema: z.object({
        household_id: uuid,
        name: z.string().trim().min(1).max(80),
        type: z.enum(LIST_TYPES as [string, ...string[]]).default("grocery"),
        store_name: z.string().trim().min(1).max(80).optional(),
      }),
    },
    ({ household_id, name, type, store_name }, ctx) =>
      run(ctx, async ({ supabase }) =>
        must(
          await supabase
            .from("lists")
            .insert({
              household_id,
              name,
              type,
              store_name: type === "grocery" ? store_name ?? null : null,
            })
            .select("id, household_id, name, type, store_name")
            .single()
        )
      )
  );

  server.registerTool(
    "delete_list",
    {
      title: "Delete list",
      description: "Permanently delete a list and all of its items.",
      inputSchema: z.object({ list_id: uuid }),
      annotations: { destructiveHint: true },
    },
    ({ list_id }, ctx) =>
      run(ctx, async ({ supabase }) => {
        check(await supabase.from("lists").delete().eq("id", list_id));
      })
  );

  // ---- Items ----------------------------------------------------------------

  server.registerTool(
    "get_items",
    {
      title: "Get items",
      description:
        "Get a list and its items. Subtasks are nested under their parent item. Checked items have a non-null checked_at; a checked repeating task also has next_due_on, the date it comes back. Dated tasks list who they remind in `remind`.",
      inputSchema: z.object({
        list_id: uuid,
        include_checked: z.boolean().default(true),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ list_id, include_checked }, ctx) =>
      run(ctx, async ({ supabase, userId }) => {
        const list = must(
          await supabase
            .from("lists")
            .select("id, household_id, name, type, store_name")
            .eq("id", list_id)
            .maybeSingle(),
          "list not found"
        );

        // Bring repeating tasks up to date first, as the app does on open, on
        // the caller's own date (their settings timezone; UTC until they have
        // one).
        if (list.type === "todo") {
          const { data: settings } = await supabase
            .from("user_settings")
            .select("timezone")
            .eq("user_id", userId)
            .maybeSingle();
          const all = must(
            await supabase
              .from("list_items")
              .select("id, checked_at, parent_item_id, due_on, repeat_every, repeat_unit, repeat_from")
              .eq("list_id", list_id)
          );
          await applyPatches(
            supabase,
            planRollover(all, localDate(new Date(), settings?.timezone ?? "UTC"))
          );
        }

        let query = supabase
          .from("list_items")
          .select(`${ITEM_COLUMNS}, item_reminders(user_id)`)
          .eq("list_id", list_id)
          .order("created_at");
        if (!include_checked) query = query.is("checked_at", null);
        const rows = must(await query).map(({ item_reminders, ...row }) => {
          const next = nextDue(row);
          return {
            ...row,
            ...(next ? { next_due_on: next } : {}),
            ...(row.due_on ? { remind: item_reminders.map((r) => r.user_id) } : {}),
          };
        });

        const byParent = new Map<string, typeof rows>();
        for (const row of rows) {
          if (!row.parent_item_id) continue;
          byParent.set(row.parent_item_id, [...(byParent.get(row.parent_item_id) ?? []), row]);
        }
        const items = rows
          .filter((row) => !row.parent_item_id)
          .map((row) => {
            const subtasks = byParent.get(row.id);
            return subtasks ? { ...row, subtasks } : row;
          });
        return { list, items };
      })
  );

  server.registerTool(
    "add_items",
    {
      title: "Add items",
      description:
        "Add one or more items to a list. For a todo subtask, set parent_item_id to a top-level item on the same list.",
      inputSchema: z.object({
        list_id: uuid,
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(200),
              parent_item_id: uuid.optional(),
              ...itemFields,
            })
          )
          .min(1)
          .max(100),
      }),
    },
    ({ list_id, items }, ctx) =>
      run(ctx, async ({ supabase, userId }) => {
        const rows = must(
          await supabase
            .from("list_items")
            .insert(items.map((item) => ({ ...itemColumns(item), list_id, created_by: userId })))
            .select(ITEM_COLUMNS)
        );
        // Rows come back in insert order, so pair each with its input.
        return Promise.all(
          rows.map(async (row, i) => {
            const remind = items[i].remind;
            return remind ? { ...row, remind: await setRemind(supabase, row.id, remind) } : row;
          })
        );
      })
  );

  server.registerTool(
    "update_item",
    {
      title: "Update item",
      description:
        "Update an item's fields. Pass null to clear a field. Set list_id to move the item to another list in the same household.",
      inputSchema: z.object({
        item_id: uuid,
        name: z.string().trim().min(1).max(200).optional(),
        list_id: uuid.optional(),
        ...itemFields,
      }),
    },
    ({ item_id, ...patch }, ctx) =>
      run(ctx, async ({ supabase }) => {
        const fields = Object.fromEntries(
          Object.entries(itemColumns(patch)).filter(([, value]) => value !== undefined)
        );
        if (Object.keys(fields).length === 0 && !patch.remind) throw new Error("nothing to update");
        const table = supabase.from("list_items");
        const row = must(
          await (Object.keys(fields).length > 0 ? table.update(fields) : table)
            .select(ITEM_COLUMNS)
            .eq("id", item_id)
            .maybeSingle(),
          "item not found"
        );
        return patch.remind
          ? { ...row, remind: await setRemind(supabase, item_id, patch.remind) }
          : row;
      })
  );

  server.registerTool(
    "set_items_checked",
    {
      title: "Check / uncheck items",
      description:
        "Check off (done / in cart) or uncheck items. On a grocery list, call finish_trip after shopping to clear checked items.",
      inputSchema: z.object({
        item_ids: z.array(uuid).min(1).max(100),
        checked: z.boolean(),
      }),
    },
    ({ item_ids, checked }, ctx) =>
      run(ctx, async ({ supabase, userId }) =>
        must(
          await supabase
            .from("list_items")
            .update(
              checked
                ? { checked_at: new Date().toISOString(), checked_by: userId }
                : { checked_at: null, checked_by: null }
            )
            .in("id", item_ids)
            .select("id, name, checked_at")
        )
      )
  );

  server.registerTool(
    "delete_items",
    {
      title: "Delete items",
      description: "Permanently delete items (and their subtasks).",
      inputSchema: z.object({ item_ids: z.array(uuid).min(1).max(100) }),
      annotations: { destructiveHint: true },
    },
    ({ item_ids }, ctx) =>
      run(ctx, async ({ supabase }) => ({
        deleted: must(
          await supabase.from("list_items").delete().in("id", item_ids).select("id")
        ).length,
      }))
  );

  // ---- Grocery --------------------------------------------------------------

  server.registerTool(
    "finish_trip",
    {
      title: "Finish shopping trip",
      description:
        "Grocery lists only: remove all checked items, log them as purchases and learn the store's aisle order from the check-off sequence.",
      inputSchema: z.object({ list_id: uuid }),
      annotations: { destructiveHint: true },
    },
    ({ list_id }, ctx) =>
      run(ctx, async ({ supabase }) => ({
        cleared: must(await supabase.rpc("record_trip", { p_list_id: list_id })),
      }))
  );

  server.registerTool(
    "buy_again",
    {
      title: "Buy-again suggestions",
      description:
        "Grocery lists only: items bought most often on this list, most frequent first.",
      inputSchema: z.object({
        list_id: uuid,
        limit: z.number().int().min(1).max(50).default(12),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ list_id, limit }, ctx) =>
      run(ctx, async ({ supabase }) =>
        must(await supabase.rpc("buy_again", { p_list_id: list_id, p_limit: limit }))
      )
  );

  // ---- Templates ------------------------------------------------------------

  server.registerTool(
    "list_templates",
    {
      title: "List templates",
      description: "List reusable item templates, optionally limited to one household.",
      inputSchema: z.object({ household_id: uuid.optional() }),
      annotations: { readOnlyHint: true },
    },
    ({ household_id }, ctx) =>
      run(ctx, async ({ supabase }) => {
        let query = supabase
          .from("templates")
          .select("id, household_id, name, template_items(item_name, sort_order)")
          .order("created_at");
        if (household_id) query = query.eq("household_id", household_id);
        return must(await query).map(({ template_items, ...template }) => ({
          ...template,
          items: [...template_items]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((ti) => ti.item_name),
        }));
      })
  );

  server.registerTool(
    "create_template",
    {
      title: "Create template",
      description: "Save a named set of item names for a household.",
      inputSchema: z.object({
        household_id: uuid,
        name: z.string().trim().min(1).max(80),
        items: z.array(z.string().trim().min(1).max(200)).max(200),
      }),
    },
    ({ household_id, name, items }, ctx) =>
      run(ctx, async ({ supabase, userId }) => {
        const template = must(
          await supabase
            .from("templates")
            .insert({ household_id, name, created_by: userId })
            .select("id")
            .single()
        );
        if (items.length > 0) {
          check(
            await supabase.from("template_items").insert(
              items.map((item_name, i) => ({
                template_id: template.id,
                item_name,
                sort_order: i,
              }))
            )
          );
        }
        return { template_id: template.id };
      })
  );

  server.registerTool(
    "apply_template",
    {
      title: "Apply template",
      description:
        "Add a template's items to a list, skipping names that are already on it.",
      inputSchema: z.object({ template_id: uuid, list_id: uuid }),
    },
    ({ template_id, list_id }, ctx) =>
      run(ctx, async ({ supabase, userId }) => {
        const templateItems = must(
          await supabase
            .from("template_items")
            .select("item_name")
            .eq("template_id", template_id)
            .order("sort_order")
        );
        const existing = must(
          await supabase.from("list_items").select("name").eq("list_id", list_id)
        );
        // Same dedupe as applyTemplate in src/components/GroceryList.tsx.
        const existingKeys = new Set(existing.map((i) => normalizeName(i.name)));
        const toAdd = templateItems
          .map((ti) => ti.item_name)
          .filter((name) => !existingKeys.has(normalizeName(name)));
        if (toAdd.length === 0) return { added: [] };

        const added = must(
          await supabase
            .from("list_items")
            .insert(toAdd.map((name) => ({ list_id, name, created_by: userId })))
            .select("id, name")
        );
        return { added };
      })
  );

  server.registerTool(
    "delete_template",
    {
      title: "Delete template",
      description: "Permanently delete a template.",
      inputSchema: z.object({ template_id: uuid }),
      annotations: { destructiveHint: true },
    },
    ({ template_id }, ctx) =>
      run(ctx, async ({ supabase }) => {
        check(await supabase.from("templates").delete().eq("id", template_id));
      })
  );
}
