"use client";

import type { Item } from "@/lib/useListItems";
import { stamp } from "@/lib/useListItems";
import {
  type ListType,
  formatPrice,
  attrLabels,
  levelColor,
} from "@/lib/listTypes";

// A single item row in the NIKOLASS terminal style. Grocery keeps main's
// behavior (row = toggle, ✕ = delete). Todo/wishlist (when `onOpen` is given)
// split the row: checkbox toggles, the name area opens the detail sheet, ✕
// deletes — and wishlist rows show priority/price/link inline.
export default function ItemRow({
  item,
  type,
  onToggle,
  onDelete,
  onOpen,
}: {
  item: Item;
  type: ListType;
  onToggle: (item: Item) => void;
  onDelete: (item: Item) => void;
  onOpen?: (item: Item) => void;
}) {
  const checked = Boolean(item.checked_at);
  const pending = item.id.startsWith("temp-");

  const checkbox = (
    <span aria-hidden className={`checkbox ${checked ? "is-checked" : ""}`}>
      {checked ? "✓" : ""}
    </span>
  );
  const nameClass = `t-body min-w-0 flex-1 truncate ${
    checked ? "text-[var(--fg-muted)] line-through" : "text-[var(--fg)]"
  }`;
  const deleteButton = (
    <button
      onClick={() => onDelete(item)}
      disabled={pending}
      aria-label={`Delete ${item.name}`}
      className="shrink-0 px-3 py-3 text-[var(--fg-disabled)] active:text-[var(--term-red)]"
    >
      ✕
    </button>
  );

  // Grocery: the whole row toggles (unchanged from main).
  if (!onOpen) {
    return (
      <li className={`flex items-center ${pending ? "opacity-60" : ""}`}>
        <button
          onClick={() => onToggle(item)}
          className={`item-row ${pending ? "is-pending" : ""}`}
        >
          {checkbox}
          <span className={nameClass}>{item.name}</span>
          <span className="t-meta shrink-0 text-[var(--fg-disabled)]">
            {stamp(item.created_at)}
          </span>
        </button>
        {deleteButton}
      </li>
    );
  }

  // Todo / wishlist: checkbox toggles, name area opens detail, ✕ deletes.
  const labels = attrLabels(type);
  const price = type === "wishlist" ? formatPrice(item.price_cents) : null;
  const showMeta =
    item.importance != null ||
    item.effort != null ||
    price ||
    (type === "wishlist" && item.url);

  return (
    <li
      className={`flex items-center border-b gap-2 border-[var(--ink-5)] ${
        pending ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={() => onToggle(item)}
        className="flex shrink-0 items-center py-3 pl-3 pr-1 active:opacity-60"
        aria-label={checked ? "Mark not done" : "Mark done"}
      >
        {checkbox}
      </button>
      <button
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center gap-2 py-3 pr-1 text-left active:bg-[var(--paper-2)]"
      >
        <span className="min-w-0 flex-1">
          <span className={`${nameClass} block`}>{item.name}</span>
          {showMeta && (
            <span className="mt-1 flex flex-wrap items-center gap-2">
              {item.importance != null && (
                <span className={`t-meta ${levelColor(item.importance, "importance")}`}>
                  IMP {item.importance}
                </span>
              )}
              {item.effort != null && (
                <span className={`t-meta ${levelColor(item.effort, "effort")}`}>
                  {labels.effortTag} {item.effort}
                </span>
              )}
              {price && (
                <span className="t-meta text-[var(--fg-2)]">{price}</span>
              )}
              {item.url && (
                <span className="t-meta text-[var(--cobalt)]">LINK</span>
              )}
            </span>
          )}
        </span>
        <span aria-hidden className="shrink-0 text-[var(--fg-disabled)]">
          ›
        </span>
      </button>
      {deleteButton}
    </li>
  );
}
