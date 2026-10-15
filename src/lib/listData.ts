import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item } from "@/lib/useListItems";
import type { ItemStat, BuyAgainItem } from "@/lib/categories";
import type { ListSummary } from "@/lib/household";

// What a list view needs, loaded the same way on the server (first render)
// and in the browser (every other list, in the background).

export type ListData = {
  items: Item[];
  /** Grocery only: learned aisle order. */
  stats: ItemStat[];
  /** Grocery only: most-bought items. */
  buyAgain: BuyAgainItem[];
};

const ITEM_COLUMNS =
  "list_id, id, name, created_at, checked_at, checked_by, created_by, priority, price_cents, url, notes, importance, effort, parent_item_id";
const DUE_COLUMNS = "due_on, repeat_every, repeat_unit, repeat_from";
const NO_DUE = {
  due_on: null,
  repeat_every: null,
  repeat_unit: null,
  repeat_from: null,
};

// Newest migration first: on a database that lacks a column the whole select
// fails, so each step drops the next-newest columns and still shows the items.
const ITEM_SELECTS: { columns: string; missing: string; fill: Partial<Item> }[] = [
  { columns: `${ITEM_COLUMNS}, ${DUE_COLUMNS}, source`, missing: "", fill: {} },
  { columns: `${ITEM_COLUMNS}, ${DUE_COLUMNS}`, missing: "0016", fill: {} },
  { columns: ITEM_COLUMNS, missing: "0011", fill: NO_DUE },
];

// Items for one or more lists, oldest first. Each row keeps its list_id so a
// batch can be split per list.
export async function fetchItems(
  supabase: SupabaseClient,
  listIds: string[]
): Promise<(Item & { list_id: string })[]> {
  if (listIds.length === 0) return [];
  let error = "";
  for (const { columns, missing, fill } of ITEM_SELECTS) {
    if (error) {
      console.error(`list_items select failed, retrying without ${missing} columns:`, error);
    }
    const res = await supabase
      .from("list_items")
      .select(columns)
      .in("list_id", listIds)
      .order("created_at", { ascending: true });
    if (!res.error) {
      const rows = res.data as unknown as (Item & { list_id: string })[];
      return rows.map((i) => ({ ...fill, ...i }));
    }
    error = res.error.message;
  }
  throw new Error(error);
}

// Aisle stats seen in the last 180 days; older ones no longer describe the
// store's layout.
export async function fetchAisleStats(
  supabase: SupabaseClient,
  listId: string
): Promise<ItemStat[]> {
  const staleCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const { data } = await supabase
    .from("item_stats")
    .select("name_key, position_score, trip_count")
    .eq("list_id", listId)
    .gte("last_seen_at", staleCutoff.toISOString());
  return data ?? [];
}

// Buy-again candidates ranked from the purchase log (RPC handles the GROUP BY).
export async function fetchBuyAgain(
  supabase: SupabaseClient,
  listId: string
): Promise<BuyAgainItem[]> {
  const { data } = await supabase.rpc("buy_again", {
    p_list_id: listId,
    p_limit: 12,
  });
  return data ?? [];
}

// Everything for several lists at once: one items query for all of them, plus
// the grocery extras per grocery list, all in parallel.
export async function fetchListData(
  supabase: SupabaseClient,
  lists: ListSummary[]
): Promise<Record<string, ListData>> {
  const groceries = lists.filter((l) => l.type === "grocery");
  const [items, extras] = await Promise.all([
    fetchItems(
      supabase,
      lists.map((l) => l.id)
    ),
    Promise.all(
      groceries.map(async (l) => {
        const [stats, buyAgain] = await Promise.all([
          fetchAisleStats(supabase, l.id),
          fetchBuyAgain(supabase, l.id),
        ]);
        return [l.id, { stats, buyAgain }] as const;
      })
    ),
  ]);

  const result: Record<string, ListData> = {};
  for (const l of lists) result[l.id] = { items: [], stats: [], buyAgain: [] };
  for (const item of items) result[item.list_id]?.items.push(item);
  for (const [id, extra] of extras) Object.assign(result[id], extra);
  return result;
}
