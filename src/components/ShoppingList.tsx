"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/actions";
import ListSwitcher from "@/components/ListSwitcher";
import { groupForStore, type ItemStat } from "@/lib/categories";

type Item = {
  id: string;
  name: string;
  created_at: string;
  checked_at: string | null;
  checked_by: string | null;
  created_by: string;
};

type Props = {
  listId: string;
  listName: string;
  lists: { id: string; name: string }[];
  householdId: string;
  householdName: string;
  inviteCode: string;
  userId: string;
  initialItems: Item[];
  initialStats: ItemStat[];
};

// crypto.randomUUID() only exists in secure contexts (https / localhost), so
// it's undefined when testing over http on a LAN IP. Fall back to a simple id.
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ShoppingList({
  listId,
  listName,
  lists,
  householdId,
  householdName,
  inviteCode,
  userId,
  initialItems,
  initialStats,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [stats, setStats] = useState<ItemStat[]>(initialStats);
  const [draft, setDraft] = useState("");
  const [invited, setInvited] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Realtime: reconcile server events into local state. Optimistic rows use
  // temp ids, so a server INSERT either replaces its temp twin (matched by
  // name + creator) or appends.
  useEffect(() => {
    const channel = supabase
      .channel(`list:${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "list_items",
          filter: `list_id=eq.${listId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Item;
            setItems((prev) => {
              if (prev.some((i) => i.id === row.id)) return prev;
              const tempIdx = prev.findIndex(
                (i) =>
                  i.id.startsWith("temp-") &&
                  i.name === row.name &&
                  i.created_by === row.created_by
              );
              if (tempIdx !== -1) {
                const next = [...prev];
                next[tempIdx] = row;
                return next;
              }
              return [...prev, row];
            });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Item;
            setItems((prev) =>
              prev.map((i) => (i.id === row.id ? row : i))
            );
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as Item;
            setItems((prev) => prev.filter((i) => i.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, listId]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    inputRef.current?.focus();

    const tempId = `temp-${makeId()}`;
    const optimistic: Item = {
      id: tempId,
      name,
      created_at: new Date().toISOString(),
      checked_at: null,
      checked_by: null,
      created_by: userId,
    };
    setItems((prev) => [...prev, optimistic]);

    const { data, error } = await supabase
      .from("list_items")
      .insert({ list_id: listId, name, created_by: userId })
      .select()
      .single();

    if (error) {
      setItems((prev) => prev.filter((i) => i.id !== tempId));
      setDraft(name);
    } else if (data) {
      setItems((prev) =>
        prev.some((i) => i.id === data.id)
          ? prev.filter((i) => i.id !== tempId)
          : prev.map((i) => (i.id === tempId ? (data as Item) : i))
      );
    }
  }

  async function toggleItem(item: Item) {
    if (item.id.startsWith("temp-")) return;
    const checking = !item.checked_at;
    const patch = {
      checked_at: checking ? new Date().toISOString() : null,
      checked_by: checking ? userId : null,
    };
    const before = items;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i))
    );

    const { error } = await supabase
      .from("list_items")
      .update(patch)
      .eq("id", item.id);
    if (error) setItems(before);
  }

  // Committing a trip: record_trip folds the checkoff order into the
  // household's aisle stats, then deletes the checked items server-side.
  async function finishTrip() {
    const checkedIds = items
      .filter((i) => i.checked_at && !i.id.startsWith("temp-"))
      .map((i) => i.id);
    if (checkedIds.length === 0) return;
    const before = items;
    setItems((prev) => prev.filter((i) => !checkedIds.includes(i.id)));

    const { error } = await supabase.rpc("record_trip", {
      p_list_id: listId,
    });
    if (error) {
      setItems(before);
      return;
    }

    const { data } = await supabase
      .from("item_stats")
      .select("name_key, position_score, trip_count")
      .eq("household_id", householdId);
    if (data) setStats(data as ItemStat[]);
  }

  async function shareInvite() {
    const url = `${window.location.origin}/join/${inviteCode}`;
    const text = `Join "${householdName}" on Listser: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Listser", text, url });
        return;
      } catch {
        // fall through to clipboard (user may have dismissed the sheet)
      }
    }
    await navigator.clipboard.writeText(url);
    setInvited(true);
    setTimeout(() => setInvited(false), 2000);
  }

  const unchecked = useMemo(
    () => items.filter((i) => !i.checked_at),
    [items]
  );
  const checked = items.filter((i) => i.checked_at);

  // Aisle order: grouped by category, sorted by the household's learned
  // checkoff positions (canonical store-walk order until trips exist).
  const statsMap = useMemo(
    () => new Map(stats.map((s) => [s.name_key, s])),
    [stats]
  );
  const groups = useMemo(
    () => groupForStore(unchecked, statsMap),
    [unchecked, statsMap]
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24">
      <header className="flex items-center justify-between py-4">
        <div>
          <ListSwitcher
            lists={lists}
            activeListId={listId}
            activeListName={listName}
            householdId={householdId}
          />
          <p className="text-xs text-neutral-400">{householdName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={shareInvite}
            className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm font-medium active:bg-neutral-100 dark:border-neutral-700 dark:active:bg-neutral-800"
          >
            {invited ? "Copied!" : "Invite"}
          </button>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full px-2 py-1.5 text-sm text-neutral-400 active:text-neutral-600"
              aria-label="Sign out"
            >
              ↩
            </button>
          </form>
        </div>
      </header>

      {/* Capture first: the add box lives at the top, always one tap away. */}
      <form onSubmit={addItem} className="sticky top-0 z-10 bg-background pb-3 pt-1">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add something…"
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="sentences"
            className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-base outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-xl bg-emerald-600 px-5 text-xl font-semibold text-white active:bg-emerald-700 disabled:opacity-40"
            aria-label="Add item"
          >
            +
          </button>
        </div>
      </form>

      {unchecked.length === 0 && checked.length === 0 && (
        <p className="py-12 text-center text-sm text-neutral-400">
          Nothing here yet. Add the first thing you’ll forget otherwise.
        </p>
      )}
      {groups.map((group) => (
        <section key={group.category}>
          {groups.length > 1 && (
            <h2 className="px-1 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {group.label}
            </h2>
          )}
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={toggleItem} />
            ))}
          </ul>
        </section>
      ))}

      {checked.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              In the cart ({checked.length})
            </h2>
            <button
              onClick={finishTrip}
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white active:bg-emerald-700"
            >
              Done ✓
            </button>
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {checked.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={toggleItem} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function ItemRow({
  item,
  onToggle,
}: {
  item: Item;
  onToggle: (item: Item) => void;
}) {
  const checked = Boolean(item.checked_at);
  const pending = item.id.startsWith("temp-");
  return (
    <li>
      <button
        onClick={() => onToggle(item)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-neutral-100 dark:active:bg-neutral-800 ${
          pending ? "opacity-60" : ""
        }`}
      >
        <span
          aria-hidden
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm ${
            checked
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-neutral-300 dark:border-neutral-600"
          }`}
        >
          {checked ? "✓" : ""}
        </span>
        <span
          className={`text-base ${
            checked ? "text-neutral-400 line-through" : ""
          }`}
        >
          {item.name}
        </span>
      </button>
    </li>
  );
}
