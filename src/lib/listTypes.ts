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
      "// nothing logged yet — add the first thing you'd forget otherwise.",
    checkedHeading: "IN CART",
    clearLabel: "[DONE]",
  },
  todo: {
    label: "To-do",
    tag: "TODO",
    addPlaceholder: "Add a task…",
    emptyState: "// all clear — add your first task.",
    checkedHeading: "DONE",
    clearLabel: "[CLEAR]",
  },
  wishlist: {
    label: "Wishlist",
    tag: "WISH",
    addPlaceholder: "Add something you want…",
    emptyState: "// empty wishlist — add something you want.",
    checkedHeading: "GOT IT",
    clearLabel: "[CLEAR]",
  },
};

// Format integer cents as a euro amount (this household shops Rimi/Maxima).
export function formatPrice(cents: number | null): string | null {
  if (cents == null) return null;
  return `€${(cents / 100).toFixed(2)}`;
}
