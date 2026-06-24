"use client";

import { useState } from "react";
import Drawer from "@/components/Drawer";
import type { Item } from "@/lib/useListItems";
import { type ListType, COPY } from "@/lib/listTypes";

type ListSummary = { id: string; name: string; type: ListType };

// Item editor built on the shared Drawer. Wishlist gets priority / price / link;
// every type gets a name and notes. Hosts the "Move to…" promotion picker.
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
  onDelete: (item: Item) => void;
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
    onDelete(item);
    onClose();
  }

  function handleMove(targetListId: string) {
    onMove(item, targetListId);
    onClose();
  }

  return (
    <Drawer open onClose={onClose} title="Edit" code="[ITM]">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="t-meta">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="field"
          />
        </label>

        {isWishlist && (
          <>
            <div className="flex flex-col gap-1">
              <span className="t-meta">Priority</span>
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
                    className={`btn btn-sm flex-1 ${
                      priority === value ? "btn-acid" : ""
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="t-meta">Rough price (€)</span>
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="field"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="t-meta">Link</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                inputMode="url"
                autoCapitalize="off"
                placeholder="https://…"
                className="field"
              />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="t-meta">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={2}
            className="field resize-none"
          />
        </label>

        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="btn btn-acid w-full"
        >
          Save
        </button>

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="t-small text-center text-[var(--cobalt)]"
          >
            Open link ↗
          </a>
        )}

        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--ink-5)] pt-3">
          {moveTargets.length > 0 &&
            (showMove ? (
              <div className="flex flex-col gap-1">
                <span className="t-meta px-1 pb-1">Move to…</span>
                {moveTargets.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => handleMove(l.id)}
                    className="flex items-center gap-2 border-b border-[var(--ink-5)] px-2 py-2.5 text-left active:bg-[var(--paper-2)]"
                  >
                    <span className="t-stamp text-[var(--fg-muted)]">
                      {COPY[l.type].tag}
                    </span>
                    <span className="t-body truncate">{l.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setShowMove(true)}
                className="btn btn-sm btn-ghost w-full"
              >
                Move to another list
              </button>
            ))}

          <button
            onClick={handleDelete}
            className="btn btn-sm btn-ghost w-full active:text-[var(--term-red)]"
          >
            Delete item
          </button>
        </div>
      </div>
    </Drawer>
  );
}
