import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LAST_LIST_COOKIE, listHref } from "@/lib/lastList";
import type { ListType } from "@/lib/listTypes";
import type { Member } from "@/lib/reminders";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Household = { id: string; name: string; invite_code: string };

export type ListSummary = {
  id: string;
  name: string;
  store_name: string | null;
  type: ListType;
};

// The household the app shows: the user's first one.
export async function fetchHousehold(
  supabase: Supabase
): Promise<Household | undefined> {
  const { data } = await supabase
    .from("household_members")
    .select("household_id, households(id, name, invite_code)")
    .order("joined_at", { ascending: true })
    .limit(1);
  return data?.[0]?.households as unknown as Household | undefined;
}

export async function fetchLists(
  supabase: Supabase,
  householdId: string
): Promise<ListSummary[]> {
  const { data } = await supabase
    .from("lists")
    .select("id, name, store_name, type")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  return (data ?? []) as ListSummary[];
}

// Empty when the 0012 member function is missing.
export async function fetchMembers(
  supabase: Supabase,
  householdId: string
): Promise<Member[]> {
  const { data } = await supabase.rpc("household_member_list", {
    p_household_id: householdId,
  });
  return (data ?? []) as Member[];
}

// Unchecked top-level items per list, for the list switcher.
export async function fetchOpenCounts(
  supabase: Supabase,
  listIds: string[]
): Promise<Record<string, number>> {
  if (listIds.length === 0) return {};
  const { data } = await supabase
    .from("list_items")
    .select("list_id")
    .in("list_id", listIds)
    .is("checked_at", null)
    .is("parent_item_id", null);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.list_id] = (counts[row.list_id] ?? 0) + 1;
  }
  return counts;
}

export async function lastListId(): Promise<string | undefined> {
  return (await cookies()).get(LAST_LIST_COOKIE)?.value;
}

// Everything the menu and its pages need: who you are, your household, and
// the list to go back to.
export async function loadNavContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const household = await fetchHousehold(supabase);
  if (!household) redirect("/");

  const lists = await fetchLists(supabase, household.id);
  const lastId = await lastListId();
  const list = lists.find((l) => l.id === lastId) ?? lists[0];

  return {
    supabase,
    user,
    household,
    back: { href: listHref(list?.id), name: list?.name ?? "Lists" },
  };
}
