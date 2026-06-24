"use client";

import type { Item } from "@/lib/useListItems";
import { type ListType, formatPrice } from "@/lib/listTypes";

// A single item row. The checkbox toggles done/checked state. When `onOpen` is
// provided (todo / wishlist), the rest of the row is a separate tap target that
// opens the detail sheet. Grocery passes no `onOpen`, so the whole row toggles —
// preserving the original fast tap-to-check behavior.
export default function ItemRow({
  item,
  type,
  onToggle,
  onOpen,
}: {
  item: Item;
  type: ListType;
  onToggle: (item: Item) => void;
  onOpen?: (item: Item) => void;
}) {
  const checked = Boolean(item.checked_at);
  const pending = item.id.startsWith("temp-");
  const price = type === "wishlist" ? formatPrice(item.price_cents) : null;
  const showMeta =
    type === "wishlist" && (item.priority || price || item.url);

  const checkbox = (
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
  );

  const nameBlock = (
    <span className="min-w-0 flex-1">
      <span
        className={`block text-base ${
          checked ? "text-neutral-400 line-through" : ""
        }`}
      >
        {item.name}
      </span>
      {showMeta && (
        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          {item.priority && (
            <span
              className={`rounded-full px-1.5 py-0.5 font-medium ${
                item.priority === "soon"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                  : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {item.priority === "soon" ? "Soon" : "Someday"}
            </span>
          )}
          {price && <span>{price}</span>}
          {item.url && <span aria-hidden>🔗</span>}
        </span>
      )}
    </span>
  );

  // Grocery: the entire row is one toggle button (unchanged behavior).
  if (!onOpen) {
    return (
      <li>
        <button
          onClick={() => onToggle(item)}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-neutral-100 dark:active:bg-neutral-800 ${
            pending ? "opacity-60" : ""
          }`}
        >
          {checkbox}
          {nameBlock}
        </button>
      </li>
    );
  }

  // Todo / wishlist: checkbox toggles, the rest opens the detail sheet.
  return (
    <li
      className={`flex items-center gap-1 rounded-xl active:bg-neutral-100 dark:active:bg-neutral-800 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={() => onToggle(item)}
        className="flex shrink-0 items-center py-3 pl-3 pr-1"
        aria-label={checked ? "Mark not done" : "Mark done"}
      >
        {checkbox}
      </button>
      <button
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center py-3 pr-3 text-left"
      >
        {nameBlock}
        <span aria-hidden className="ml-2 shrink-0 text-neutral-300">
          ›
        </span>
      </button>
    </li>
  );
}
