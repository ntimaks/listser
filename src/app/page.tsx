import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createHousehold } from "./actions";
import ListHeader from "@/components/ListHeader";
import ShoppingList from "@/components/ShoppingList";
import {
  fetchHousehold,
  fetchLists,
  fetchMembers,
  fetchOpenCounts,
  lastListId,
} from "@/lib/household";

async function fetchAisleStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listId: string
) {
  const staleCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const { data } = await supabase
    .from("item_stats")
    .select("name_key, position_score, trip_count")
    .eq("list_id", listId)
    .gte("last_seen_at", staleCutoff.toISOString());
  return data ?? [];
}

// Buy-again candidates ranked from the purchase log (RPC handles the GROUP BY).
async function fetchBuyAgain(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listId: string
) {
  const { data } = await supabase.rpc("buy_again", {
    p_list_id: listId,
    p_limit: 12,
  });
  return data ?? [];
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const supabase = await createClient();
  // Independent lookups run together: every query here is a round-trip to
  // Supabase, so a chain of awaits adds up fast. RLS scopes the household
  // lookup to the caller, so it needn't wait for getUser.
  const [
    {
      data: { user },
    },
    household,
    lastId,
    { list: requestedId },
  ] = await Promise.all([
    supabase.auth.getUser(),
    fetchHousehold(supabase),
    lastListId(),
    searchParams,
  ]);
  if (!user) redirect("/login");

  if (!household) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
        <div className="text-center">
          <h1 className="t-h1">LISTSER</h1>
          <p className="t-meta mt-2">
            {"// "}create a household to start. you&rsquo;ll get an invite link
            to share.
          </p>
        </div>
        <form action={createHousehold} className="w-full max-w-sm space-y-3">
          <label className="t-meta block">
            Household <span className="text-[var(--fg-disabled)]">[REQ]</span>
          </label>
          <input
            name="name"
            required
            autoFocus
            maxLength={80}
            placeholder="e.g. Home"
            className="field"
          />
          <button type="submit" className="btn btn-primary w-full">
            [CREATE HOUSEHOLD]
          </button>
        </form>
        <p className="t-meta max-w-sm text-center">
          {"// "}got an invite link? open it and you&rsquo;ll join their
          household automatically.
        </p>
      </main>
    );
  }

  const [lists, members] = await Promise.all([
    fetchLists(supabase, household.id),
    // Household members: avatars in the header, and who a to-do reminds.
    fetchMembers(supabase, household.id),
  ]);
  // Without a valid ?list=, reopen the list you were last on, else the first.
  const list =
    lists.find((l) => l.id === requestedId) ??
    lists.find((l) => l.id === lastId) ??
    lists[0];
  if (!list) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="t-small text-center text-[var(--fg-2)]">
          {"// "}no list was found for this household. re-run the setup SQL or
          create one in Supabase.
        </p>
      </main>
    );
  }

  const baseColumns =
    "id, name, created_at, checked_at, checked_by, created_by, priority, price_cents, url, notes, importance, effort, parent_item_id";
  // Aisle stats, buy-again and templates are grocery-only; skip the
  // round-trips otherwise.
  const isGrocery = list.type === "grocery";
  const [full, openCounts, stats, buyAgain, { data: templatesData }] =
    await Promise.all([
      supabase
        .from("list_items")
        .select(`${baseColumns}, due_on, repeat_every, repeat_unit, repeat_from`)
        .eq("list_id", list.id)
        .order("created_at", { ascending: true }),
      fetchOpenCounts(
        supabase,
        lists.map((l) => l.id)
      ),
      isGrocery ? fetchAisleStats(supabase, list.id) : [],
      isGrocery ? fetchBuyAgain(supabase, list.id) : [],
      isGrocery
        ? supabase
            .from("templates")
            .select("id, name, template_items(item_name, sort_order)")
            .eq("household_id", household.id)
            .order("created_at", { ascending: true })
        : { data: [] },
    ]);
  let items = full.data;

  // Without migration 0011 the due-date columns don't exist and the whole
  // select fails. Still show the items, with no due dates.
  if (full.error) {
    console.error("list_items select failed, retrying without 0011 columns:", full.error.message);
    const fallback = await supabase
      .from("list_items")
      .select(baseColumns)
      .eq("list_id", list.id)
      .order("created_at", { ascending: true });
    if (fallback.error) console.error("list_items select failed:", fallback.error.message);
    items = (fallback.data ?? []).map((i) => ({
      ...i,
      due_on: null,
      repeat_every: null,
      repeat_unit: null,
      repeat_from: null,
    }));
  }

  const templates = (templatesData ?? []) as {
    id: string;
    name: string;
    template_items: { item_name: string; sort_order: number }[];
  }[];

  return (
    <ShoppingList
      key={list.id}
      listId={list.id}
      listType={list.type}
      header={
        <ListHeader
          lists={lists}
          activeListId={list.id}
          openCounts={openCounts}
          householdId={household.id}
          householdName={household.name}
          members={members}
          userId={user.id}
        />
      }
      lists={lists}
      householdId={household.id}
      userId={user.id}
      initialItems={items ?? []}
      initialStats={stats}
      initialBuyAgain={buyAgain}
      initialTemplates={templates}
      members={members}
    />
  );
}
