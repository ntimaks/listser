"use client";

import { useMemo, useRef, useState } from "react";
import ListHeader from "@/components/ListHeader";
import ItemRow from "@/components/ItemRow";
import ItemDetailSheet from "@/components/ItemDetailSheet";
import Hint from "@/components/Hint";
import Pixl from "@/components/Pixl";
import { useListItems, type Item } from "@/lib/useListItems";
import { COPY, attrLabels, quickWinSort, type ListType } from "@/lib/listTypes";

type ListSummary = {
  id: string;
  name: string;
  store_name: string | null;
  type: ListType;
};

type Props = {
  type: "todo" | "wishlist";
  listId: string;
  listName: string;
  lists: ListSummary[];
  householdId: string;
  householdName: string;
  inviteCode: string;
  userId: string;
  initialItems: Item[];
};

// Flat view for the non-grocery types: non-destructive completion (done/acquired
// items stay until cleared), a tap-to-edit detail sheet, and item promotion.
export default function SimpleList({
  type,
  listId,
  listName,
  lists,
  householdId,
  householdName,
  inviteCode,
  userId,
  initialItems,
}: Props) {
  const { items, addItem, toggleItem, updateItem, deleteItem, deleteItems, moveItem } =
    useListItems(listId, userId, initialItems);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const copy = COPY[type];
  // "Effort" on a to-do reads as "Cost" on a wishlist — keep the hint in sync.
  const effortWord = attrLabels(type).effort.toLowerCase();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    inputRef.current?.focus();
    await addItem(name);
  }

  const unchecked = items.filter((i) => !i.checked_at);
  const checked = items.filter((i) => i.checked_at);

  // "Quick wins": high-importance, low-effort items float to the top (for both
  // to-do and wishlist). Unrated items sink to the bottom.
  const activeItems = useMemo(() => quickWinSort(unchecked), [unchecked]);

  // Keep the open detail sheet bound to the latest item state.
  const editingItem = editing
    ? items.find((i) => i.id === editing.id) ?? null
    : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24">
      <ListHeader
        lists={lists}
        activeListId={listId}
        activeListName={listName}
        activeListStoreName={null}
        activeListType={type}
        householdId={householdId}
        householdName={householdName}
        inviteCode={inviteCode}
        itemCount={unchecked.length + checked.length}
      />

      <form
        onSubmit={handleAdd}
        className="sticky top-0 z-10 bg-[var(--bg)] pb-3 pt-3"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={copy.addPlaceholder}
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
        <div className="flex flex-col items-center gap-3 py-12 text-[var(--fg-muted)]">
          <Pixl motion="wave" size={48} title="Pixl, waving" />
          <p className="t-small text-center">{copy.emptyState}</p>
        </div>
      )}

      {activeItems.length > 1 && (
        <Hint motion="idle" className="mt-1">
          ordered by quick wins — high importance, low {effortWord} first
        </Hint>
      )}

      <ul className="mt-1 flex flex-col">
        {activeItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            type={type}
            onToggle={toggleItem}
            onDelete={deleteItem}
            onOpen={setEditing}
          />
        ))}
      </ul>

      {checked.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between border-b border-[var(--ink-5)] px-1 pb-1.5">
            <h2 className="t-meta">
              [{copy.checkedHeading} · {checked.length}]
            </h2>
            <button
              onClick={() => deleteItems(checked.map((i) => i.id))}
              className="btn btn-sm btn-ghost"
            >
              {copy.clearLabel}
            </button>
          </div>
          <Hint motion="sleep" className="mt-1.5">
            kept here until you tap {copy.clearLabel}
          </Hint>
          <ul className="flex flex-col">
            {checked.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                type={type}
                onToggle={toggleItem}
                onDelete={deleteItem}
                onOpen={setEditing}
              />
            ))}
          </ul>
        </section>
      )}

      {editingItem && (
        <ItemDetailSheet
          key={editingItem.id}
          item={editingItem}
          type={type}
          lists={lists}
          currentListId={listId}
          onClose={() => setEditing(null)}
          onSave={updateItem}
          onDelete={deleteItem}
          onMove={moveItem}
        />
      )}
    </main>
  );
}
