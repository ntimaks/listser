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

// ISO-ish datestamp, logbook style: 26.06.15
function stamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(
    d.getDate()
  )}`;
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

  const today = stamp(new Date().toISOString());
  const total = unchecked.length + checked.length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24">
      {/* Logbook header band */}
      <header className="panel mt-3">
        <div className="panel-head">
          <span>LISTSER // SHOPPING LOG</span>
          <span>
            {today} · {total} {total === 1 ? "ITEM" : "ITEMS"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <ListSwitcher
              lists={lists}
              activeListId={listId}
              activeListName={listName}
              householdId={householdId}
            />
            <p className="t-meta mt-1 truncate">▸ {householdName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={shareInvite} className="btn btn-sm">
              {invited ? "[COPIED]" : "[INVITE]"}
            </button>
            <form action={signOut}>
              <button
                type="submit"
                className="btn btn-sm btn-ghost"
                aria-label="Sign out"
              >
                EXIT
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Capture first: the add box lives at the top, always one tap away. */}
      <form
        onSubmit={addItem}
        className="sticky top-0 z-10 bg-[var(--bg)] pb-3 pt-3"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add something…"
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="sentences"
            className="field min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="btn btn-acid shrink-0"
            aria-label="Add item"
          >
            + ADD
          </button>
        </div>
      </form>

      {unchecked.length === 0 && checked.length === 0 && (
        <p className="t-small py-12 text-center text-[var(--fg-muted)]">
          {"// "}nothing logged yet — add the first thing you&rsquo;d forget
          otherwise.
        </p>
      )}
      {groups.map((group, gi) => (
        <section key={group.category} className="mt-4 first:mt-1">
          {groups.length > 1 && (
            <h2 className="t-meta flex items-center justify-between border-b border-[var(--ink-5)] px-1 pb-1.5">
              <span>{group.label}</span>
              <span className="text-[var(--fg-disabled)]">
                [{String(gi + 1).padStart(2, "0")}]
              </span>
            </h2>
          )}
          <ul className="flex flex-col">
            {group.items.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={toggleItem} />
            ))}
          </ul>
        </section>
      ))}

      {checked.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between border-b border-[var(--ink-5)] px-1 pb-1.5">
            <h2 className="t-meta">[IN CART · {checked.length}]</h2>
            <button onClick={finishTrip} className="btn btn-sm btn-primary">
              [DONE]
            </button>
          </div>
          <ul className="flex flex-col">
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
        className={`item-row ${pending ? "is-pending" : ""}`}
      >
        <span
          aria-hidden
          className={`checkbox ${checked ? "is-checked" : ""}`}
        >
          {checked ? "✓" : ""}
        </span>
        <span
          className={`t-body min-w-0 flex-1 truncate ${
            checked
              ? "text-[var(--fg-muted)] line-through"
              : "text-[var(--fg)]"
          }`}
        >
          {item.name}
        </span>
        <span className="t-meta shrink-0 text-[var(--fg-disabled)]">
          {stamp(item.created_at)}
        </span>
      </button>
    </li>
  );
}
