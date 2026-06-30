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
// deletes — and wishlist rows show priority/price/link inline. `isSubtask`
// renders an indented, lean variant (toggle + name + delete, no detail/meta);
// `progress` shows a pixel progress bar + done/total counter on a parent row.
export default function ItemRow({
  item,
  type,
  onToggle,
  onDelete,
  onOpen,
  isSubtask = false,
  progress,
}: {
  item: Item;
  type: ListType;
  onToggle: (item: Item) => void;
  onDelete: (item: Item) => void;
  onOpen?: (item: Item) => void;
  isSubtask?: boolean;
  progress?: { done: number; total: number };
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

  // Subtask: indented and lean — the whole name area toggles (a big, forgiving
  // tap target for fast check-offs), ✕ deletes. No detail sheet, no meta.
  if (isSubtask) {
    return (
      <li
        className={`subtask-row flex items-center gap-2 ${
          pending ? "opacity-60" : ""
        }`}
      >
        <button
          onClick={() => onToggle(item)}
          className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-1 text-left active:bg-[var(--paper-2)]"
          aria-label={checked ? "Mark not done" : "Mark done"}
        >
          {checkbox}
          <span className={`${nameClass} block`}>{item.name}</span>
        </button>
        {deleteButton}
      </li>
    );
  }

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
  // A parent row with subtasks; null narrows the bar/counter out otherwise.
  const prog = progress && progress.total > 0 ? progress : null;
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
          {prog && (
            <span aria-hidden className="progress mt-1.5 block">
              <span
                className="progress-fill block"
                style={{ width: `${(prog.done / prog.total) * 100}%` }}
              />
            </span>
          )}
        </span>
        {prog ? (
          <span
            className="t-pixel shrink-0 leading-none text-[var(--fg-2)]"
            aria-label={`${prog.done} of ${prog.total} done`}
          >
            {prog.done}/{prog.total}
          </span>
        ) : (
          <span aria-hidden className="shrink-0 text-[var(--fg-disabled)]">
            ›
          </span>
        )}
      </button>
      {deleteButton}
    </li>
  );
}
