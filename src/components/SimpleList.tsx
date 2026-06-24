"use client";

import { useMemo, useRef, useState } from "react";
import ListHeader from "@/components/ListHeader";
import ItemRow from "@/components/ItemRow";
import ItemDetailSheet from "@/components/ItemDetailSheet";
import { useListItems, type Item } from "@/lib/useListItems";
import { COPY, type ListType } from "@/lib/listTypes";

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

// Shared view for the non-grocery list types: a flat list with non-destructive
// completion (done/acquired items stay until explicitly cleared), a tap-to-edit
// detail sheet, and item promotion. Grocery keeps its own aisle-aware view.
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
  const { items, addItem, toggleItem, updateItem, deleteItems, moveItem } =
    useListItems(listId, userId, initialItems);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const copy = COPY[type];

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

  // Wishlist floats "soon" items to the top so "someday" ones don't clutter it;
  // todo keeps insertion order.
  const activeItems = useMemo(() => {
    if (type !== "wishlist") return unchecked;
    const rank = (p: Item["priority"]) =>
      p === "soon" ? 0 : p === "someday" ? 2 : 1;
    return [...unchecked].sort((a, b) => rank(a.priority) - rank(b.priority));
  }, [unchecked, type]);

  // Keep the open detail sheet in sync with the latest item state (e.g. after a
  // realtime update lands while it's open).
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
      />

      <form onSubmit={handleAdd} className="sticky top-0 z-10 bg-background pb-3 pt-1">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={copy.addPlaceholder}
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
          {copy.emptyState}
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {activeItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            type={type}
            onToggle={toggleItem}
            onOpen={setEditing}
          />
        ))}
      </ul>

      {checked.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {copy.checkedHeading} ({checked.length})
            </h2>
            <button
              onClick={() => deleteItems(checked.map((i) => i.id))}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-500 active:bg-neutral-100 dark:border-neutral-700 dark:active:bg-neutral-800"
            >
              {copy.clearLabel}
            </button>
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {checked.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                type={type}
                onToggle={toggleItem}
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
          onDelete={(id) => deleteItems([id])}
          onMove={moveItem}
        />
      )}
    </main>
  );
}
