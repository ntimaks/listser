import GroceryList from "@/components/GroceryList";
import SimpleList from "@/components/SimpleList";
import type { Item } from "@/lib/useListItems";
import type { ItemStat } from "@/lib/categories";
import type { ListType } from "@/lib/listTypes";

type Template = {
  id: string;
  name: string;
  template_items: { item_name: string; sort_order: number }[];
};

type ListSummary = {
  id: string;
  name: string;
  store_name: string | null;
  type: ListType;
};

type Props = {
  listId: string;
  listName: string;
  listStoreName: string | null;
  listType: ListType;
  lists: ListSummary[];
  householdId: string;
  householdName: string;
  inviteCode: string;
  userId: string;
  initialItems: Item[];
  initialStats: ItemStat[];
  initialTemplates: Template[];
};

// Dispatcher: each list type gets its own experience. Grocery keeps the
// aisle-aware shopping engine (stats + templates); todo/wishlist share the
// simpler flat view with non-destructive completion.
export default function ShoppingList(props: Props) {
  if (props.listType === "grocery") {
    return (
      <GroceryList
        listId={props.listId}
        listName={props.listName}
        listStoreName={props.listStoreName}
        lists={props.lists}
        householdId={props.householdId}
        householdName={props.householdName}
        inviteCode={props.inviteCode}
        userId={props.userId}
        initialItems={props.initialItems}
        initialStats={props.initialStats}
        initialTemplates={props.initialTemplates}
      />
    );
  }

  return (
    <SimpleList
      type={props.listType}
      listId={props.listId}
      listName={props.listName}
      lists={props.lists}
      householdId={props.householdId}
      householdName={props.householdName}
      inviteCode={props.inviteCode}
      userId={props.userId}
      initialItems={props.initialItems}
    />
  );
}
