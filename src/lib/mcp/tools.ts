import { z } from "zod";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { createTokenClient, type TokenClient } from "@/lib/supabase/token";
import { LIST_TYPES } from "@/lib/listTypes";
import { normalizeName } from "@/lib/categories";

// Columns an MCP client sees for an item. Mirrors the Item type in
// src/lib/useListItems.ts minus the legacy `priority` flag.
const ITEM_COLUMNS =
  "id, name, notes, url, price_cents, importance, effort, parent_item_id, created_at, checked_at";

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
};

const INSTRUCTIONS = `Listser is a shared household list app. A user belongs to one or more households; each household has lists of type "grocery", "todo" or "wishlist".
- Start with list_households / list_lists to find ids.
- Grocery: check items off while shopping, then call finish_trip to clear checked items and teach the app the store's aisle order. buy_again suggests frequently bought items.
- Todo: items can have one level of subtasks (parent_item_id). Checked tasks stay as a record.
- Wishlist: price_cents, url, importance and effort (cost) describe wishes.
- Templates are reusable grocery item sets per household.`;

export const serverInstructions = INSTRUCTIONS;

export function registerTools(server: McpServer) {
  // ---- Households -----------------------------------------------------------

  server.registerTool(
    "list_households",
    {
      title: "List households",
      description: "List the households the user belongs to, with their invite codes.",
      annotations: { readOnlyHint: true },
    },
    (ctx) =>
      run(ctx, async ({ supabase }) =>
        must(
          await supabase
            .from("households")
            .select("id, name, invite_code, created_at")
            .order("created_at")
        )
      )
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
        "Get a list and its items. Subtasks are nested under their parent item. Checked items have a non-null checked_at.",
      inputSchema: z.object({
        list_id: uuid,
        include_checked: z.boolean().default(true),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ list_id, include_checked }, ctx) =>
      run(ctx, async ({ supabase }) => {
        const list = must(
          await supabase
            .from("lists")
            .select("id, household_id, name, type, store_name")
            .eq("id", list_id)
            .maybeSingle(),
          "list not found"
        );

        let query = supabase
          .from("list_items")
          .select(ITEM_COLUMNS)
          .eq("list_id", list_id)
          .order("created_at");
        if (!include_checked) query = query.is("checked_at", null);
        const rows = must(await query);

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
      run(ctx, async ({ supabase, userId }) =>
        must(
          await supabase
            .from("list_items")
            .insert(items.map((item) => ({ ...item, list_id, created_by: userId })))
            .select(ITEM_COLUMNS)
        )
      )
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
          Object.entries(patch).filter(([, value]) => value !== undefined)
        );
        if (Object.keys(fields).length === 0) throw new Error("nothing to update");
        const row = must(
          await supabase
            .from("list_items")
            .update(fields)
            .eq("id", item_id)
            .select(ITEM_COLUMNS)
            .maybeSingle(),
          "item not found"
        );
        return row;
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
