import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createHousehold } from "./actions";
import ShoppingList from "@/components/ShoppingList";

// Learned aisle positions; ignore stats from over ~6 months ago so the
// sort adapts after a move or store remodel.
async function fetchAisleStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string
) {
  const staleCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const { data } = await supabase
    .from("item_stats")
    .select("name_key, position_score, trip_count")
    .eq("household_id", householdId)
    .gte("last_seen_at", staleCutoff.toISOString());
  return data ?? [];
}

export default async function Home() {
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

  const { data: lists } = await supabase
    .from("lists")
    .select("id, name")
    .eq("household_id", household.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const list = lists?.[0];
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
    .select("id, name, created_at, checked_at, checked_by, created_by")
    .eq("list_id", list.id)
    .order("created_at", { ascending: true });

  const stats = await fetchAisleStats(supabase, household.id);

  return (
    <ShoppingList
      listId={list.id}
      listName={list.name}
      householdId={household.id}
      householdName={household.name}
      inviteCode={household.invite_code}
      userId={user.id}
      initialItems={items ?? []}
      initialStats={stats}
    />
  );
}
