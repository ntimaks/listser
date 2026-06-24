"use client";

import { useMemo, useRef, useState } from "react";
import { createTemplate, deleteTemplate } from "@/app/actions";
import ListHeader from "@/components/ListHeader";
import ItemRow from "@/components/ItemRow";
import { useListItems, type Item } from "@/lib/useListItems";
import { groupForStore, normalizeName, type ItemStat } from "@/lib/categories";
import { COPY, type ListType } from "@/lib/listTypes";

type TemplateItem = { item_name: string; sort_order: number };
type Template = { id: string; name: string; template_items: TemplateItem[] };

type ListSummary = {
  id: string;
  name: string;
  store_name: string | null;
  type: ListType;
};

type Props = {
  listId: string;
  listName: string;
  listStoreName: string | null;
  lists: ListSummary[];
  householdId: string;
  householdName: string;
  inviteCode: string;
  userId: string;
  initialItems: Item[];
  initialStats: ItemStat[];
  initialTemplates: Template[];
};

export default function GroceryList({
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
  const { supabase, items, setItems, addItem, toggleItem, makeId } =
    useListItems(listId, userId, initialItems);
  const [stats, setStats] = useState<ItemStat[]>(initialStats);
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [draft, setDraft] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    inputRef.current?.focus();
    await addItem(name);
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
      priority: null,
      price_cents: null,
      url: null,
      notes: null,
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24">
      <ListHeader
        lists={lists}
        activeListId={listId}
        activeListName={listName}
        activeListStoreName={listStoreName}
        activeListType="grocery"
        householdId={householdId}
        householdName={householdName}
        inviteCode={inviteCode}
      />

      {/* Capture first: the add box lives at the top, always one tap away. */}
      <form onSubmit={handleAdd} className="sticky top-0 z-10 bg-background pb-3 pt-1">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={COPY.grocery.addPlaceholder}
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
        <p className="py-12 text-center text-sm text-neutral-400">
          {COPY.grocery.emptyState}
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
              <ItemRow
                key={item.id}
                item={item}
                type="grocery"
                onToggle={toggleItem}
              />
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
              <ItemRow
                key={item.id}
                item={item}
                type="grocery"
                onToggle={toggleItem}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex justify-center">
        <button
          onClick={() => setShowTemplates(true)}
          className="text-sm text-neutral-400 underline-offset-2 active:opacity-60"
        >
          Templates
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
