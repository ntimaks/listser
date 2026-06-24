"use client";

import { useState } from "react";
import type { Item } from "@/lib/useListItems";
import { type ListType, COPY } from "@/lib/listTypes";

type ListSummary = { id: string; name: string; type: ListType };

// Bottom-sheet editor for a single item. Fields shown depend on the list type:
// wishlist gets priority / price / link, everything gets a name and notes.
// Hosts the "Move to…" promotion picker (e.g. wishlist -> shopping list).
export default function ItemDetailSheet({
  item,
  type,
  lists,
  currentListId,
  onClose,
  onSave,
  onDelete,
  onMove,
}: {
  item: Item;
  type: ListType;
  lists: ListSummary[];
  currentListId: string;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
  onMove: (item: Item, targetListId: string) => void;
}) {
  const [name, setName] = useState(item.name);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [priority, setPriority] = useState<Item["priority"]>(item.priority);
  const [url, setUrl] = useState(item.url ?? "");
  const [priceInput, setPriceInput] = useState(
    item.price_cents != null ? (item.price_cents / 100).toFixed(2) : ""
  );
  const [showMove, setShowMove] = useState(false);

  const isWishlist = type === "wishlist";
  const moveTargets = lists.filter((l) => l.id !== currentListId);

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const patch: Partial<Item> = { name: trimmedName };
    patch.notes = notes.trim() || null;
    if (isWishlist) {
      patch.priority = priority;
      patch.url = url.trim() || null;
      const parsed = parseFloat(priceInput.replace(",", "."));
      patch.price_cents =
        priceInput.trim() && !Number.isNaN(parsed)
          ? Math.round(parsed * 100)
          : null;
    }
    onSave(item.id, patch);
    onClose();
  }

  function handleDelete() {
    onDelete(item.id);
    onClose();
  }

  function handleMove(targetListId: string) {
    onMove(item, targetListId);
    onClose();
  }

  const fieldClass =
    "w-full rounded-xl border border-neutral-300 px-3 py-2 text-base outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md rounded-t-2xl bg-background p-4 pb-8 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Edit</h2>
          <button
            onClick={onClose}
            className="text-sm text-neutral-400 active:opacity-70"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              className={fieldClass}
            />
          </label>

          {isWishlist && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-neutral-400">
                  Priority
                </span>
                <div className="flex gap-2">
                  {(
                    [
                      ["soon", "Soon"],
                      ["someday", "Someday"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setPriority((p) => (p === value ? null : value))
                      }
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                        priority === value
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                          : "border-neutral-300 text-neutral-500 dark:border-neutral-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-neutral-400">
                  Rough price (€)
                </span>
                <input
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={fieldClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-neutral-400">
                  Link
                </span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  inputMode="url"
                  autoCapitalize="off"
                  placeholder="https://…"
                  className={fieldClass}
                />
              </label>
            </>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={2}
              className={`${fieldClass} resize-none`}
            />
          </label>

          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="mt-1 w-full rounded-xl bg-emerald-600 px-3 py-3 text-base font-semibold text-white active:bg-emerald-700 disabled:opacity-40"
          >
            Save
          </button>

          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm text-emerald-600 underline-offset-2 active:opacity-70"
            >
              Open link ↗
            </a>
          )}

          <div className="mt-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            {moveTargets.length > 0 &&
              (showMove ? (
                <div className="flex flex-col gap-1">
                  <span className="px-1 pb-1 text-xs font-medium text-neutral-400">
                    Move to…
                  </span>
                  {moveTargets.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => handleMove(l.id)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-base active:bg-neutral-100 dark:active:bg-neutral-800"
                    >
                      <span aria-hidden>{COPY[l.type].icon}</span>
                      {l.name}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => setShowMove(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-800"
                >
                  <span aria-hidden>↗</span> Move to another list
                </button>
              ))}

            <button
              onClick={handleDelete}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-500 active:bg-red-50 dark:active:bg-red-950"
            >
              <span aria-hidden>🗑</span> Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
