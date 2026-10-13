"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ListHeader from "@/components/ListHeader";
import SyncStatus from "@/components/SyncStatus";
import ShoppingList from "@/components/ShoppingList";
import { ListBodySkeleton } from "@/components/Skeleton";
import type { Template } from "@/components/GroceryList";
import { createClient } from "@/lib/supabase/client";
import { listHref } from "@/lib/lastList";
import { useListStore } from "@/lib/useListStore";
import type { ListData } from "@/lib/listData";
import type { ListSummary } from "@/lib/household";
import { detectTimeZone, type Member } from "@/lib/reminders";

type Props = {
  lists: ListSummary[];
  householdId: string;
  householdName: string;
  members: Member[];
  userId: string;
  /** The list the server rendered: ?list=, else the last one, else the first. */
  initialListId: string;
  initialData: ListData;
  initialTemplates: Template[];
  /** Open counts from the server, for lists not loaded yet. */
  initialOpenCounts: Record<string, number>;
  /** When the server rendered this page; it may come from the offline cache. */
  renderedAt: number;
};

/**
 * The list screen. Holds every list in memory (useListStore), so switching
 * lists is a local state change: the URL updates through the history API,
 * which Next.js picks up without asking the server for a new page.
 */
export default function ListApp({
  lists,
  householdId,
  householdName,
  members,
  userId,
  initialListId,
  initialData,
  initialTemplates,
  initialOpenCounts,
  renderedAt,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { store, failed, load, settersFor } = useListStore({
    supabase,
    householdId,
    userId,
    lists,
    seedListId: initialListId,
    seedData: initialData,
    renderedAt,
  });

  // A page served from the offline cache can be days old, and the lists,
  // members and templates come from the server render: ask for a fresh one.
  const router = useRouter();
  useEffect(() => {
    if (navigator.onLine && Date.now() - renderedAt > 60_000) router.refresh();
  }, [router, renderedAt]);

  // Give every user a settings row with their browser's timezone, so reminders
  // go out at the right local time even if they never open the settings.
  // Leaves an existing row alone.
  useEffect(() => {
    supabase
      .from("user_settings")
      .upsert(
        { user_id: userId, timezone: detectTimeZone() },
        { onConflict: "user_id", ignoreDuplicates: true }
      )
      .then(() => {});
  }, [supabase, userId]);

  // Templates are household-wide, so they live here and survive switching. A
  // server render after saving one hands over the real rows (replacing the
  // optimistic copy and its temp id).
  const [templates, setTemplates] = useState(initialTemplates);
  const [seenTemplates, setSeenTemplates] = useState(initialTemplates);
  if (initialTemplates !== seenTemplates) {
    setSeenTemplates(initialTemplates);
    setTemplates(initialTemplates);
  }

  // The URL is the source of truth for which list is showing, so back/forward
  // and reloads land where you were.
  const requestedId = useSearchParams().get("list");
  const active =
    lists.find((l) => l.id === requestedId) ??
    lists.find((l) => l.id === initialListId) ??
    lists[0];

  function selectList(listId: string) {
    window.history.pushState(null, "", listHref(listId));
    window.scrollTo(0, 0);
  }

  // Live counts for loaded lists; the server's for the rest.
  const openCounts = useMemo(() => {
    const counts = { ...initialOpenCounts };
    for (const l of lists) {
      const data = store[l.id];
      if (data) {
        counts[l.id] = data.items.filter(
          (i) => !i.checked_at && i.parent_item_id == null
        ).length;
      }
    }
    return counts;
  }, [initialOpenCounts, lists, store]);

  const setters = useMemo(
    () => settersFor(active.id),
    [settersFor, active.id]
  );

  const header = (
    <>
      <ListHeader
        lists={lists}
        activeListId={active.id}
        openCounts={openCounts}
        householdId={householdId}
        householdName={householdName}
        members={members}
        onSelectList={selectList}
      />
      <SyncStatus />
    </>
  );

  const data = store[active.id];
  if (!data) {
    // Only reachable when switching before the background load finishes, or
    // if it failed.
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24">
        {header}
        {failed.has(active.id) ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="t-small text-center text-[var(--fg-2)]">
              {"// "}couldn&rsquo;t load this list.
            </p>
            <button onClick={() => load([active])} className="btn btn-sm">
              [RETRY]
            </button>
          </div>
        ) : (
          <ListBodySkeleton />
        )}
      </main>
    );
  }

  return (
    <ShoppingList
      key={active.id}
      supabase={supabase}
      listId={active.id}
      listType={active.type}
      header={header}
      lists={lists}
      householdId={householdId}
      userId={userId}
      items={data.items}
      setItems={setters.setItems}
      stats={data.stats}
      setStats={setters.setStats}
      buyAgain={data.buyAgain}
      setBuyAgain={setters.setBuyAgain}
      templates={templates}
      setTemplates={setTemplates}
      members={members}
    />
  );
}
