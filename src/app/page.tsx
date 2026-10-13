import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { createHousehold } from "./actions";
import ListApp from "@/components/ListApp";
import type { Template } from "@/components/GroceryList";
import {
  fetchHousehold,
  fetchLists,
  fetchMembers,
  fetchOpenCounts,
  lastListId,
} from "@/lib/household";
import { fetchListData, type ListData } from "@/lib/listData";

// The server renders once per request, so reading the clock here is fine.
function readTime() {
  return Date.now();
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const supabase = await createClient();
  // Independent lookups run together: every query here is a round-trip to
  // Supabase, so a chain of awaits adds up fast. RLS scopes the household
  // lookup to the caller, so it needn't wait for the auth check.
  const [user, household, lastId, { list: requestedId }] = await Promise.all([
    getAuthUser(supabase),
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

  // This list's data, the open counts for the switcher, and the household's
  // templates (any list can be switched to a grocery one). The other lists
  // load in the browser right after (see useListStore).
  // renderedAt: when the list was read, so the browser can tell this page
  // from an older copy (offline cache) and from its own saved copy.
  const renderedAt = readTime();
  const [listData, openCounts, { data: templatesData }] = await Promise.all([
    fetchListData(supabase, [list]).catch((e): Record<string, ListData> => {
      console.error("list data failed:", e);
      return {};
    }),
    fetchOpenCounts(
      supabase,
      lists.map((l) => l.id)
    ),
    supabase
      .from("templates")
      .select("id, name, template_items(item_name, sort_order)")
      .eq("household_id", household.id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <ListApp
      key={household.id}
      lists={lists}
      householdId={household.id}
      householdName={household.name}
      members={members}
      userId={user.id}
      initialListId={list.id}
      initialData={
        listData[list.id] ?? { items: [], stats: [], buyAgain: [] }
      }
      initialTemplates={(templatesData ?? []) as Template[]}
      initialOpenCounts={openCounts}
      renderedAt={renderedAt}
    />
  );
}
