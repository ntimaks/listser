// Per-type metadata shared across the list views. Grocery copy matches the
// existing logbook tone; todo/wishlist follow the same terminal aesthetic.

export type ListType = "grocery" | "todo" | "wishlist";

export const LIST_TYPES: ListType[] = ["grocery", "todo", "wishlist"];

export function isListType(value: unknown): value is ListType {
  return value === "grocery" || value === "todo" || value === "wishlist";
}

type TypeCopy = {
  label: string; // human label for the create picker
  tag: string; // short [STAMP] code shown beside list names
  addPlaceholder: string;
  emptyState: string;
  checkedHeading: string; // bracketed heading for the done/checked section
  clearLabel: string; // button that clears the done section
};

export const COPY: Record<ListType, TypeCopy> = {
  grocery: {
    label: "Groceries",
    tag: "GRO",
    addPlaceholder: "Add something…",
    emptyState:
      "// nothing added yet. add the first thing you would forget.",
    checkedHeading: "IN CART",
    clearLabel: "[DONE]",
  },
  todo: {
    label: "To-do",
    tag: "TODO",
    addPlaceholder: "Add a task…",
    emptyState: "// all clear. add your first task.",
    checkedHeading: "DONE",
    clearLabel: "[CLEAR]",
  },
  wishlist: {
    label: "Wishlist",
    tag: "WISH",
    addPlaceholder: "Add something you want…",
    emptyState: "// your wishlist is empty. add something you want.",
    checkedHeading: "GOT IT",
    clearLabel: "[CLEAR]",
  },
};

// Format integer cents as a euro amount (this household shops Rimi/Maxima).
export function formatPrice(cents: number | null): string | null {
  if (cents == null) return null;
  return `€${(cents / 100).toFixed(2)}`;
}

// ---- Rankable attributes (importance + effort/cost, 1–5) -------------------

export const LEVELS = [1, 2, 3, 4, 5] as const;

// "Effort" reads as "Cost" on a wishlist. Importance is the same everywhere.
type AttrLabels = { importance: string; effort: string; effortTag: string };
const ATTR_LABELS: Record<ListType, AttrLabels> = {
  grocery: { importance: "Importance", effort: "Effort", effortTag: "EFF" },
  todo: { importance: "Importance", effort: "Effort", effortTag: "EFF" },
  wishlist: { importance: "Importance", effort: "Cost", effortTag: "COST" },
};
export function attrLabels(type: ListType): AttrLabels {
  return ATTR_LABELS[type];
}

// Branding color class for an attribute level. Importance ramps toward the
// vermillion hero hue; effort/cost ramps from kelly (easy/cheap) to red.
export function levelColor(
  value: number | null,
  kind: "importance" | "effort"
): string {
  if (value == null) return "text-[var(--fg-muted)]";
  if (kind === "importance") {
    if (value >= 4) return "text-[var(--vermillion)]";
    if (value === 3) return "text-[var(--fg-2)]";
    return "text-[var(--fg-muted)]";
  }
  if (value >= 4) return "text-[var(--term-red)]";
  if (value === 3) return "text-[var(--fg-2)]";
  return "text-[var(--kelly)]";
}

// "Quick wins": highest importance first, ties broken by lowest effort. Unrated
// items sink (importance → 0); unknown effort sorts after known-low effort.
export function quickWinSort<
  T extends { importance: number | null; effort: number | null }
>(items: T[]): T[] {
  const imp = (i: T) => i.importance ?? 0;
  const eff = (i: T) => i.effort ?? 99;
  return [...items].sort((a, b) => imp(b) - imp(a) || eff(a) - eff(b));
}
