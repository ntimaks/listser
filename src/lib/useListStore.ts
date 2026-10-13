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
import { idbGet, idbSet } from "@/lib/idb";
import {
  applyOps,
  overlayOps,
  pendingOps,
  startOutbox,
  type Op,
} from "@/lib/outbox";

type Store = Record<string, ListData>;
type Snapshot = { savedAt: number; data: Store };

// Coming back to the app reloads at most this often.
const REFRESH_GAP_MS = 15_000;

function apply<T>(action: SetStateAction<T>, prev: T): T {
  return typeof action === "function"
    ? (action as (p: T) => T)(prev)
    : action;
}

// Lay ops over every list held. Keeps the store object when nothing changes.
function applyToStore(s: Store, ops: Op[]): Store {
  let next: Store | null = null;
  for (const [id, d] of Object.entries(s)) {
    const items = applyOps(d.items, id, ops);
    if (items === d.items) continue;
    next ??= { ...s };
    next[id] = { ...d, items };
  }
  return next ?? s;
}

/**
 * Every list in the household, held in memory so switching lists is instant.
 * The server renders the list you open; all lists (that one included, to
 * catch up) load in the background right after. One realtime channel covers all of them, so a list you switch to is
 * already up to date, edits by others included.
 *
 * Offline: the lists are kept on the device, so the app opens with what you
 * last saw. Changes go through the write queue (outbox), whose pending ops are
 * laid over everything loaded or received, so a reload never undoes them.
 * Coming back online or to the app reloads everything, since realtime doesn't
 * replay what was missed.
 */
export function useListStore({
  supabase,
  householdId,
  userId,
  lists,
  seedListId,
  seedData,
  renderedAt,
}: {
  supabase: SupabaseClient;
  householdId: string;
  userId: string;
  lists: ListSummary[];
  /** The list the server rendered, and its data. */
  seedListId: string;
  seedData: ListData;
  /** When the server rendered it (the page may come from the offline cache). */
  renderedAt: number;
}) {
  const [store, setStore] = useState<Store>(() => ({ [seedListId]: seedData }));
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  // Lists loaded or loading, so each is fetched once. The server-rendered
  // list is fetched again too: it may come from a prefetch or the back/forward
  // cache, minutes old, and realtime only covers changes from now on.
  const requested = useRef(new Set<string>());
  // When each list's data was read from the server, to tell whether the copy
  // saved on the device is newer.
  const loadedAt = useRef(new Map<string, number>([[seedListId, renderedAt]]));

  // A later server render (e.g. landing on a list you just created) can hand
  // over a list not loaded yet. Ones already held are kept: realtime has kept
  // them current.
  const [seen, setSeen] = useState(seedData);
  if (seedData !== seen) {
    setSeen(seedData);
    setStore((s) =>
      s[seedListId]
        ? s
        : {
            ...s,
            [seedListId]: {
              ...seedData,
              items: applyOps(seedData.items, seedListId, pendingOps()),
            },
          }
    );
  }

  const load = useCallback(
    async (toLoad: ListSummary[], force = false) => {
      const fresh = force
        ? toLoad
        : toLoad.filter((l) => !requested.current.has(l.id));
      if (fresh.length === 0) return;
      for (const l of fresh) requested.current.add(l.id);
      setFailed((f) => {
        if (!fresh.some((l) => f.has(l.id))) return f;
        const next = new Set(f);
        for (const l of fresh) next.delete(l.id);
        return next;
      });
      const startedAt = Date.now();
      try {
        const data = await fetchListData(supabase, fresh);
        for (const id of Object.keys(data)) loadedAt.current.set(id, startedAt);
        // The server's rows, with changes not sent yet (or only just sent,
        // which this read may predate) laid back on top.
        const ops = overlayOps();
        setStore((s) => {
          const next = { ...s };
          for (const [id, d] of Object.entries(data)) {
            next[id] = { ...d, items: applyOps(d.items, id, ops) };
          }
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

  // Reload everything when the connection or the app comes back.
  const lastRefresh = useRef(0);
  const refresh = useEffectEvent((always: boolean) => {
    if (!always && Date.now() - lastRefresh.current < REFRESH_GAP_MS) return;
    lastRefresh.current = Date.now();
    load(lists, true);
  });
  useEffect(() => {
    lastRefresh.current = Date.now();
    const onOnline = () => refresh(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(false);
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // The write queue: show each change as it's queued, and reload if the
  // server refuses one.
  const onReject = useEffectEvent(() => refresh(true));
  useEffect(
    () =>
      startOutbox({
        supabase,
        userId,
        onApply: (ops) => setStore((s) => applyToStore(s, ops)),
        onReject: () => onReject(),
      }),
    [supabase, userId]
  );

  // The copy on the device: read once on mount, for lists the server hasn't
  // sent anything newer for, then kept up to date. Nothing is saved before the
  // read, so a stale page can't overwrite a newer copy.
  const snapshotKey = `lists:${userId}`;
  const [snapshotRead, setSnapshotRead] = useState(false);
  useEffect(() => {
    let cancelled = false;
    idbGet<Snapshot>(snapshotKey).then((snap) => {
      if (cancelled) return;
      if (snap) {
        const ops = pendingOps();
        setStore((s) => {
          const next = { ...s };
          for (const [id, d] of Object.entries(snap.data)) {
            if ((loadedAt.current.get(id) ?? 0) >= snap.savedAt) continue;
            next[id] = { ...d, items: applyOps(d.items, id, ops) };
          }
          return next;
        });
      }
      setSnapshotRead(true);
    });
    return () => {
      cancelled = true;
    };
  }, [snapshotKey]);
  useEffect(() => {
    if (!snapshotRead) return;
    const t = setTimeout(() => {
      const held = new Set(lists.map((l) => l.id));
      const data = Object.fromEntries(
        Object.entries(store).filter(([id]) => held.has(id))
      );
      idbSet(snapshotKey, { savedAt: Date.now(), data } satisfies Snapshot);
    }, 500);
    return () => clearTimeout(t);
  }, [snapshotRead, snapshotKey, store, lists]);

  const updateList = useCallback(
    (listId: string, fn: (d: ListData) => ListData) =>
      setStore((s) => (s[listId] ? { ...s, [listId]: fn(s[listId]) } : s)),
    []
  );

  // Realtime for all the household's lists. Events for a list that hasn't
  // loaded yet are dropped; its fetch will include them. Our own changes not
  // sent yet stay on top of what others do meanwhile.
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
              items: applyOps(
                reconcileInsert(d.items, row),
                row.list_id,
                pendingOps()
              ),
            }));
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Item & { list_id: string };
            updateList(row.list_id, (d) => ({
              ...d,
              items: applyOps(
                d.items.map((i) => (i.id === row.id ? row : i)),
                row.list_id,
                pendingOps()
              ),
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
