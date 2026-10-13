import type { ReactNode } from "react";
import GroceryList from "@/components/GroceryList";
import SimpleList from "@/components/SimpleList";
import type { Item } from "@/lib/useListItems";
import type { ItemStat, BuyAgainItem } from "@/lib/categories";
import type { ListType } from "@/lib/listTypes";
import type { ListSummary } from "@/lib/household";
import type { Member } from "@/lib/reminders";

type Template = {
  id: string;
  name: string;
  template_items: { item_name: string; sort_order: number }[];
};

type Props = {
  listId: string;
  listType: ListType;
  header: ReactNode;
  lists: ListSummary[];
  householdId: string;
  userId: string;
  initialItems: Item[];
  initialStats: ItemStat[];
  initialBuyAgain: BuyAgainItem[];
  initialTemplates: Template[];
  members: Member[];
};

// Dispatcher: each list type gets its own experience. Grocery keeps the
// aisle-aware shopping engine (stats + templates); todo/wishlist share the
// simpler flat view with non-destructive completion.
export default function ShoppingList(props: Props) {
  if (props.listType === "grocery") {
    return (
      <GroceryList
        listId={props.listId}
        header={props.header}
        householdId={props.householdId}
        userId={props.userId}
        initialItems={props.initialItems}
        initialStats={props.initialStats}
        initialBuyAgain={props.initialBuyAgain}
        initialTemplates={props.initialTemplates}
      />
    );
  }

  return (
    <SimpleList
      type={props.listType}
      listId={props.listId}
      header={props.header}
      lists={props.lists}
      userId={props.userId}
      initialItems={props.initialItems}
      members={props.members}
    />
  );
}
