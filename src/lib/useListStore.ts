"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchListData, type ListData } from "@/lib/listData";
import { reconcileInsert, type Item } from "@/lib/useListItems";
import type { ItemStat, BuyAgainItem } from "@/lib/categories";
import type { ListSummary } from "@/lib/household";

type Store = Record<string, ListData>;

function apply<T>(action: SetStateAction<T>, prev: T): T {
  return typeof action === "function"
    ? (action as (p: T) => T)(prev)
    : action;
}

/**
 * Every list in the household, held in memory so switching lists is instant.
 * The server renders the list you open; the rest load in the background right
 * after. One realtime channel covers all of them, so a list you switch to is
 * already up to date, edits by others included.
 */
export function useListStore({
  supabase,
  householdId,
  lists,
  seedListId,
  seedData,
}: {
  supabase: SupabaseClient;
  householdId: string;
  lists: ListSummary[];
  /** The list the server rendered, and its data. */
  seedListId: string;
  seedData: ListData;
}) {
  const [store, setStore] = useState<Store>(() => ({ [seedListId]: seedData }));
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  // Lists loaded or loading, so each is fetched once.
  const requested = useRef(new Set([seedListId]));

  // A later server render (e.g. landing on a list you just created) can hand
  // over a list not loaded yet. Ones already held are kept: realtime has kept
  // them current, and they may carry edits still in flight.
  const [seen, setSeen] = useState(seedData);
  if (seedData !== seen) {
    setSeen(seedData);
    setStore((s) => (s[seedListId] ? s : { ...s, [seedListId]: seedData }));
  }

  const load = useCallback(
    async (toLoad: ListSummary[]) => {
      const fresh = toLoad.filter((l) => !requested.current.has(l.id));
      if (fresh.length === 0) return;
      for (const l of fresh) requested.current.add(l.id);
      setFailed((f) => {
        if (!fresh.some((l) => f.has(l.id))) return f;
        const next = new Set(f);
        for (const l of fresh) next.delete(l.id);
        return next;
      });
      try {
        const data = await fetchListData(supabase, fresh);
        // Never overwrite a list that got data some other way meanwhile.
        setStore((s) => {
          const next = { ...s };
          for (const [id, d] of Object.entries(data)) next[id] ??= d;
          return next;
        });
      } catch (e) {
        console.error("Couldn't load lists:", e);
        for (const l of fresh) requested.current.delete(l.id);
        setFailed((f) => new Set([...f, ...fresh.map((l) => l.id)]));
      }
    },
    [supabase]
  );

  // Load every list not held yet: on mount, and when a list is added.
  const idsKey = lists
    .map((l) => l.id)
    .sort()
    .join(",");
  const loadMissing = useEffectEvent(() => {
    load(lists);
  });
  useEffect(() => {
    loadMissing();
  }, [idsKey]);

  const updateList = useCallback(
    (listId: string, fn: (d: ListData) => ListData) =>
      setStore((s) => (s[listId] ? { ...s, [listId]: fn(s[listId]) } : s)),
    []
  );

  // Realtime for all the household's lists. Events for a list that hasn't
  // loaded yet are dropped; its fetch will include them.
  useEffect(() => {
    if (!idsKey) return;
    const channel = supabase
      .channel(`household-items:${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "list_items",
          filter: `list_id=in.(${idsKey})`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Item & { list_id: string };
            updateList(row.list_id, (d) => ({
              ...d,
              items: reconcileInsert(d.items, row),
            }));
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Item & { list_id: string };
            updateList(row.list_id, (d) => ({
              ...d,
              items: d.items.map((i) => (i.id === row.id ? row : i)),
            }));
          } else if (payload.eventType === "DELETE") {
            // DELETE events carry only the primary key, so look in every list.
            const id = (payload.old as { id: string }).id;
            setStore((s) => {
              let next: Store | null = null;
              for (const [listId, d] of Object.entries(s)) {
                if (!d.items.some((i) => i.id === id)) continue;
                next ??= { ...s };
                next[listId] = { ...d, items: d.items.filter((i) => i.id !== id) };
              }
              return next ?? s;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, householdId, idsKey, updateList]);

  // State setters scoped to one list, shaped like useState's.
  const settersFor = useCallback(
    (listId: string) => ({
      setItems: (action: SetStateAction<Item[]>) =>
        updateList(listId, (d) => ({ ...d, items: apply(action, d.items) })),
      setStats: (action: SetStateAction<ItemStat[]>) =>
        updateList(listId, (d) => ({ ...d, stats: apply(action, d.stats) })),
      setBuyAgain: (action: SetStateAction<BuyAgainItem[]>) =>
        updateList(listId, (d) => ({
          ...d,
          buyAgain: apply(action, d.buyAgain),
        })),
    }),
    [updateList]
  );

  return { store, failed, load, settersFor };
}
