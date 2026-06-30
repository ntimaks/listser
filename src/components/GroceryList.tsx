"use client";

import { useMemo, useRef, useState } from "react";
import { createTemplate, deleteTemplate } from "@/app/actions";
import ListHeader from "@/components/ListHeader";
import ItemRow from "@/components/ItemRow";
import Drawer from "@/components/Drawer";
import Hint from "@/components/Hint";
import Pixl from "@/components/Pixl";
import { useListItems, makeId, type Item } from "@/lib/useListItems";
import {
  groupForStore,
  normalizeName,
  type ItemStat,
  type BuyAgainItem,
} from "@/lib/categories";
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
  initialBuyAgain: BuyAgainItem[];
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
  initialBuyAgain,
  initialTemplates,
}: Props) {
  const { supabase, items, setItems, addItem, toggleItem, deleteItem } =
    useListItems(listId, userId, initialItems);
  const [stats, setStats] = useState<ItemStat[]>(initialStats);
  const [buyAgain, setBuyAgain] = useState<BuyAgainItem[]>(initialBuyAgain);
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

    // The trip just appended to the purchase log, so buy-again ranks shift.
    const { data: ba } = await supabase.rpc("buy_again", {
      p_list_id: listId,
      p_limit: 12,
    });
    if (ba) setBuyAgain(ba as BuyAgainItem[]);
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
      importance: null,
      effort: null,
      parent_item_id: null,
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

  // Buy-again: the list's most-bought items (ranked server-side from the
  // purchase log) that aren't already on the list — in the cart or not.
  const suggestions = useMemo(() => {
    const onList = new Set(items.map((i) => normalizeName(i.name)));
    return buyAgain.filter((b) => !onList.has(b.name_key)).slice(0, 6);
  }, [buyAgain, items]);

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
        itemCount={unchecked.length + checked.length}
      />

      {/* Capture first: the add box lives at the top, always one tap away. */}
      <form
        onSubmit={handleAdd}
        className="sticky top-0 z-10 bg-[var(--bg)] pb-3 pt-3"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={COPY.grocery.addPlaceholder}
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
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.name_key}
                  type="button"
                  onClick={() => addItem(s.name)}
                  className="btn btn-sm btn-ghost"
                  aria-label={`Add ${s.name}`}
                >
                  + {s.name}
                </button>
              ))}
            </div>
            <Hint motion="wave" className="mt-1.5">
              your most-bought items. tap to add one
            </Hint>
          </>
        )}
      </form>

      {unchecked.length === 0 && checked.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-[var(--fg-muted)]">
          <Pixl motion="sleep" size={48} title="Pixl, asleep" />
          <p className="t-small text-center">{COPY.grocery.emptyState}</p>
        </div>
      )}
      {unchecked.length > 0 && groups.length > 1 && (
        <Hint motion="idle" className="mt-3">
          sorted by aisle automatically. it learns your store as you shop
        </Hint>
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
              <ItemRow
                key={item.id}
                item={item}
                type="grocery"
                onToggle={toggleItem}
                onDelete={deleteItem}
              />
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
          <Hint motion="jump" className="mt-1.5">
            [DONE] banks your aisle order, then clears the cart
          </Hint>
          <ul className="flex flex-col">
            {checked.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                type="grocery"
                onToggle={toggleItem}
                onDelete={deleteItem}
              />
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

      <Drawer
        open={showTemplates}
        onClose={closeTemplates}
        title="Templates"
        code="[TPL]"
      >
        <Hint motion="idle" className="mb-3">
          save a set of items once, re-add them all in one tap
        </Hint>
        {templates.length === 0 ? (
          <p className="t-small py-4 text-center text-[var(--fg-muted)]">
            {"// "}no templates yet. save your current list to reuse it later.
          </p>
        ) : (
          <ul className="mb-4 flex flex-col">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex items-center justify-between gap-2 border-b border-[var(--ink-5)] py-2.5"
              >
                <div className="min-w-0">
                  <p className="t-body truncate">{template.name}</p>
                  <p className="t-meta">
                    {template.template_items.length}{" "}
                    {template.template_items.length === 1 ? "item" : "items"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => applyTemplate(template)}
                    className="btn btn-sm btn-acid"
                  >
                    Use
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="btn btn-sm btn-ghost active:text-[var(--term-red)]"
                    aria-label={`Delete ${template.name}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-[var(--ink-5)] pt-3">
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
                className="field min-w-0 flex-1"
              />
              <button
                onClick={handleSaveTemplate}
                disabled={!saveTemplateName.trim() || unchecked.length === 0}
                className="btn btn-sm btn-acid shrink-0"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveTemplate(true)}
              disabled={unchecked.length === 0}
              className="btn btn-ghost flex w-full items-center justify-center gap-2"
            >
              <span aria-hidden>＋</span>
              Save current list as template
              {unchecked.length > 0 && <span>({unchecked.length})</span>}
            </button>
          )}
        </div>
      </Drawer>
    </main>
  );
}
