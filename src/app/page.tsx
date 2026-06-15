import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createHousehold } from "./actions";
import ShoppingList from "@/components/ShoppingList";


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
          {"// "}got an invite link? just open it — you&rsquo;ll join their
          household automatically.
        </p>
      </main>
    );
  }

  const { data } = await supabase
    .from("lists")
    .select("id, name")
    .eq("household_id", household.id)
    .order("created_at", { ascending: true });

  const lists = data ?? [];
  // Fall back to the first list when the ?list= param is missing or stale.
  const { list: requestedId } = await searchParams;
  const list = lists.find((l) => l.id === requestedId) ?? lists[0];
  if (!list) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="t-small text-center text-[var(--fg-2)]">
          {"// "}no list found for this household — re-run the setup SQL or
          create one in Supabase.
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
      key={list.id}
      listId={list.id}
      listName={list.name}
      lists={lists}
      householdId={household.id}
      householdName={household.name}
      inviteCode={household.invite_code}
      userId={user.id}
      initialItems={items ?? []}
      initialStats={stats}
    />
  );
}
