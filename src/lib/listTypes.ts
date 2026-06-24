// Per-type metadata shared across the list views. Grocery copy is unchanged
// from the original single-purpose app; todo/wishlist read naturally.

export type ListType = "grocery" | "todo" | "wishlist";

export const LIST_TYPES: ListType[] = ["grocery", "todo", "wishlist"];

export function isListType(value: unknown): value is ListType {
  return (
    value === "grocery" || value === "todo" || value === "wishlist"
  );
}

type TypeCopy = {
  label: string; // human label for the type
  icon: string; // small glyph shown in the switcher
  addPlaceholder: string;
  emptyState: string;
  checkedHeading: string; // heading for the done/checked section
  clearLabel: string; // button that clears the done section
};

export const COPY: Record<ListType, TypeCopy> = {
  grocery: {
    label: "Groceries",
    icon: "🛒",
    addPlaceholder: "Add something…",
    emptyState: "Nothing here yet. Add the first thing you'll forget otherwise.",
    checkedHeading: "In the cart",
    clearLabel: "Done ✓",
  },
  todo: {
    label: "To-do",
    icon: "✓",
    addPlaceholder: "Add a task…",
    emptyState: "All clear. Add your first task.",
    checkedHeading: "Completed",
    clearLabel: "Clear completed",
  },
  wishlist: {
    label: "Wishlist",
    icon: "★",
    addPlaceholder: "Add something you want…",
    emptyState: "Nothing on your wishlist yet. Add something you want.",
    checkedHeading: "Got it",
    clearLabel: "Clear acquired",
  },
};

// Format integer cents as a euro amount (this household shops Rimi/Maxima).
export function formatPrice(cents: number | null): string | null {
  if (cents == null) return null;
  return `€${(cents / 100).toFixed(2)}`;
}
