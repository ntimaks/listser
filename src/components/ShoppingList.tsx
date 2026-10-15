import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import GroceryList, { type Template } from "@/components/GroceryList";
import SimpleList from "@/components/SimpleList";
import type { Item } from "@/lib/useListItems";
import type { ItemStat, BuyAgainItem } from "@/lib/categories";
import type { ListType } from "@/lib/listTypes";
import type { ListSummary } from "@/lib/household";
import type { Member } from "@/lib/reminders";

type Props = {
  supabase: SupabaseClient;
  listId: string;
  listType: ListType;
  header: ReactNode;
  lists: ListSummary[];
  householdId: string;
  userId: string;
  items: Item[];
  setItems: Dispatch<SetStateAction<Item[]>>;
  stats: ItemStat[];
  setStats: Dispatch<SetStateAction<ItemStat[]>>;
  buyAgain: BuyAgainItem[];
  setBuyAgain: Dispatch<SetStateAction<BuyAgainItem[]>>;
  templates: Template[];
  setTemplates: Dispatch<SetStateAction<Template[]>>;
  members: Member[];
};

// Dispatcher: each list type gets its own experience. Grocery keeps the
// aisle-aware shopping engine (stats + templates); todo/wishlist share the
// simpler flat view with non-destructive completion.
export default function ShoppingList(props: Props) {
  if (props.listType === "grocery") {
    return (
      <GroceryList
        supabase={props.supabase}
        listId={props.listId}
        header={props.header}
        householdId={props.householdId}
        userId={props.userId}
        items={props.items}
        setItems={props.setItems}
        stats={props.stats}
        setStats={props.setStats}
        buyAgain={props.buyAgain}
        setBuyAgain={props.setBuyAgain}
        templates={props.templates}
        setTemplates={props.setTemplates}
        members={props.members}
      />
    );
  }

  return (
    <SimpleList
      type={props.listType}
      supabase={props.supabase}
      listId={props.listId}
      header={props.header}
      lists={props.lists}
      userId={props.userId}
      items={props.items}
      setItems={props.setItems}
      members={props.members}
    />
  );
}
