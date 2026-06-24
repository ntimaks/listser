import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createHousehold } from "./actions";
import ShoppingList from "@/components/ShoppingList";

// Learned aisle positions scoped to this list's store; ignore stats from
// over ~6 months ago so the sort adapts after a move or store remodel.
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("household_members")
    .select("household_id, households(id, name, invite_code)")
    .order("joined_at", { ascending: true })
    .limit(1);

  const household = memberships?.[0]?.households as unknown as
    | { id: string; name: string; invite_code: string }
    | undefined;

  if (!household) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Listser</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Create your household to get started. You’ll get an invite link to
            share.
          </p>
        </div>
        <form action={createHousehold} className="w-full max-w-sm space-y-3">
          <input
            name="name"
            required
            autoFocus
            maxLength={80}
            placeholder="Household name (e.g. Home)"
            className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white active:bg-emerald-700"
          >
            Create household
          </button>
        </form>
        <p className="text-center text-xs text-neutral-400">
          Got an invite link from someone? Just open it — you’ll join their
          household automatically.
        </p>
      </main>
    );
  }

  const { data } = await supabase
    .from("lists")
    .select("id, name, store_name, type")
    .eq("household_id", household.id)
    .order("created_at", { ascending: true });

  const lists = (data ?? []) as {
    id: string;
    name: string;
    store_name: string | null;
    type: "grocery" | "todo" | "wishlist";
  }[];
  // Fall back to the first list when the ?list= param is missing or stale.
  const { list: requestedId } = await searchParams;
  const list = lists.find((l) => l.id === requestedId) ?? lists[0];
  if (!list) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm text-neutral-500">
          No list found for this household — re-run the setup SQL or create one
          in Supabase.
        </p>
      </main>
    );
  }

  const { data: items } = await supabase
    .from("list_items")
    .select(
      "id, name, created_at, checked_at, checked_by, created_by, priority, price_cents, url, notes"
    )
    .eq("list_id", list.id)
    .order("created_at", { ascending: true });

  // Aisle stats and templates are grocery-only; skip the round-trips otherwise.
  const isGrocery = list.type === "grocery";
  const stats = isGrocery ? await fetchAisleStats(supabase, list.id) : [];

  const { data: templatesData } = isGrocery
    ? await supabase
        .from("templates")
        .select("id, name, template_items(item_name, sort_order)")
        .eq("household_id", household.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const templates = (templatesData ?? []) as {
    id: string;
    name: string;
    template_items: { item_name: string; sort_order: number }[];
  }[];

  return (
    <ShoppingList
      key={list.id}
      listId={list.id}
      listName={list.name}
      listStoreName={list.store_name ?? null}
      listType={list.type}
      lists={lists}
      householdId={household.id}
      householdName={household.name}
      inviteCode={household.invite_code}
      userId={user.id}
      initialItems={items ?? []}
      initialStats={stats}
      initialTemplates={templates}
    />
  );
}
