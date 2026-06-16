"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signOut, createTemplate, deleteTemplate } from "@/app/actions";
import ListSwitcher from "@/components/ListSwitcher";
import { groupForStore, normalizeName, type ItemStat } from "@/lib/categories";

type Item = {
  id: string;
  name: string;
  created_at: string;
  checked_at: string | null;
  checked_by: string | null;
  created_by: string;
};

type TemplateItem = { item_name: string; sort_order: number };
type Template = { id: string; name: string; template_items: TemplateItem[] };

type Props = {
  listId: string;
  listName: string;
  listStoreName: string | null;
  lists: { id: string; name: string; store_name: string | null }[];
  householdId: string;
  householdName: string;
  inviteCode: string;
  userId: string;
  initialItems: Item[];
  initialStats: ItemStat[];
  initialTemplates: Template[];
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
  listStoreName,
  lists,
  householdId,
  householdName,
  inviteCode,
  userId,
  initialItems,
  initialStats,
  initialTemplates,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [stats, setStats] = useState<ItemStat[]>(initialStats);
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [draft, setDraft] = useState("");
  const [invited, setInvited] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
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

  async function deleteItem(item: Item) {
    if (item.id.startsWith("temp-")) return;
    const before = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { error } = await supabase
      .from("list_items")
      .delete()
      .eq("id", item.id);
    if (error) setItems(before);
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

  // Committing a trip: record_trip folds the checkoff order into this list's
  // aisle stats, then deletes the checked items server-side.
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

    const staleCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const { data } = await supabase
      .from("item_stats")
      .select("name_key, position_score, trip_count")
      .eq("list_id", listId)
      .gte("last_seen_at", staleCutoff.toISOString());
    if (data) setStats(data as ItemStat[]);
  }

  // Apply a template: bulk-insert its items, skipping names already on the list.
  async function applyTemplate(template: Template) {
    const existingKeys = new Set(items.map((i) => normalizeName(i.name)));
    const toAdd = template.template_items
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ti) => ti.item_name)
      .filter((name) => !existingKeys.has(normalizeName(name)));

    setShowTemplates(false);
    if (toAdd.length === 0) return;

    const optimisticItems: Item[] = toAdd.map((name) => ({
      id: `temp-${makeId()}`,
      name,
      created_at: new Date().toISOString(),
      checked_at: null,
      checked_by: null,
      created_by: userId,
    }));
    setItems((prev) => [...prev, ...optimisticItems]);

    const { error } = await supabase.from("list_items").insert(
      toAdd.map((name) => ({ list_id: listId, name, created_by: userId }))
    );
    if (error) {
      setItems((prev) =>
        prev.filter((i) => !optimisticItems.some((o) => o.id === i.id))
      );
    }
  }

  async function handleSaveTemplate() {
    const name = saveTemplateName.trim();
    if (!name || unchecked.length === 0) return;

    const itemNames = unchecked.map((i) => i.name);
    setSaveTemplateName("");
    setShowSaveTemplate(false);
    setShowTemplates(false);

    // Optimistic: show the template immediately in local state.
    const tempTemplate: Template = {
      id: `temp-${makeId()}`,
      name,
      template_items: itemNames.map((item_name, i) => ({
        item_name,
        sort_order: i,
      })),
    };
    setTemplates((prev) => [...prev, tempTemplate]);

    await createTemplate(householdId, name, itemNames);
  }

  async function handleDeleteTemplate(templateId: string) {
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    await deleteTemplate(templateId);
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

  const unchecked = items.filter((i) => !i.checked_at);
  const checked = items.filter((i) => i.checked_at);

  // Aisle order: grouped by category, sorted by this list's learned
  // checkoff positions (canonical store-walk order until trips exist).
  const statsMap = useMemo(
    () => new Map(stats.map((s) => [s.name_key, s])),
    [stats]
  );
  const groups = useMemo(
    () => groupForStore(unchecked, statsMap),
    [unchecked, statsMap]
  );

  // Frequently-bought items (≥3 trips) not already on the current list.
  // Stats already filtered to last 6 months by the server fetch.
  const suggestions = useMemo(() => {
    const onList = new Set(unchecked.map((i) => normalizeName(i.name)));
    return stats
      .filter((s) => s.trip_count >= 3 && !onList.has(s.name_key))
      .sort((a, b) => b.trip_count - a.trip_count)
      .slice(0, 5)
      .map((s) => s.name_key);
  }, [stats, unchecked]);

  function closeTemplates() {
    setShowTemplates(false);
    setShowSaveTemplate(false);
    setSaveTemplateName("");
  }

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
              activeListStoreName={listStoreName}
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
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setDraft(name.charAt(0).toUpperCase() + name.slice(1));
                  inputRef.current?.focus();
                }}
                className="rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-500 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800"
              >
                {name}
              </button>
            ))}
          </div>
        )}
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
              <ItemRow key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} />
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
              <ItemRow key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex justify-center">
        <button
          onClick={() => setShowTemplates(true)}
          className="btn btn-sm btn-ghost"
        >
          [TEMPLATES]
        </button>
      </div>

      {/* Templates bottom drawer */}
      {showTemplates && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            aria-hidden
            onClick={closeTemplates}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md rounded-t-2xl bg-background p-4 pb-8 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Templates</h2>
              <button
                onClick={closeTemplates}
                className="text-sm text-neutral-400 active:opacity-70"
              >
                Close
              </button>
            </div>

            {templates.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-400">
                No templates yet. Save your current list as a template to reuse it later.
              </p>
            ) : (
              <ul className="mb-4 flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
                {templates.map((template) => (
                  <li
                    key={template.id}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div>
                      <p className="text-base font-medium">{template.name}</p>
                      <p className="text-xs text-neutral-400">
                        {template.template_items.length}{" "}
                        {template.template_items.length === 1 ? "item" : "items"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => applyTemplate(template)}
                        className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white active:bg-emerald-700"
                      >
                        Use
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="rounded-full px-2 py-1 text-sm text-neutral-400 active:opacity-70"
                        aria-label={`Delete ${template.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
              {showSaveTemplate ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={saveTemplateName}
                    onChange={(e) => setSaveTemplateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTemplate();
                      if (e.key === "Escape") {
                        setShowSaveTemplate(false);
                        setSaveTemplateName("");
                      }
                    }}
                    placeholder="Template name…"
                    maxLength={80}
                    className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!saveTemplateName.trim() || unchecked.length === 0}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white active:bg-emerald-700 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSaveTemplate(true)}
                  disabled={unchecked.length === 0}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-neutral-500 active:bg-neutral-100 disabled:opacity-40 dark:active:bg-neutral-800"
                >
                  <span aria-hidden>＋</span>
                  Save current list as template
                  {unchecked.length > 0 && (
                    <span className="text-xs text-neutral-400">
                      ({unchecked.length})
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function ItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: Item;
  onToggle: (item: Item) => void;
  onDelete: (item: Item) => void;
}) {
  const checked = Boolean(item.checked_at);
  const pending = item.id.startsWith("temp-");
  return (
    <li
      className={`flex items-center rounded-xl ${
        pending ? "opacity-60" : ""
      }`}
    >
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
      <button
        onClick={() => onDelete(item)}
        disabled={pending}
        aria-label={`Delete ${item.name}`}
        className="shrink-0 px-3 py-3 text-[var(--fg-disabled)] active:text-red-500"
      >
        ✕
      </button>
    </li>
  );
}
