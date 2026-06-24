"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Item = {
  id: string;
  name: string;
  created_at: string;
  checked_at: string | null;
  checked_by: string | null;
  created_by: string;
  // Optional fields added in 0006. Null on grocery rows; used by wishlist
  // (priority/price/url) and shared by todo+wishlist (notes).
  priority: "soon" | "someday" | null;
  price_cents: number | null;
  url: string | null;
  notes: string | null;
};

// Fields a caller may set when creating an item (wishlist add, etc.).
export type ItemExtras = Partial<
  Pick<Item, "priority" | "price_cents" | "url" | "notes">
>;

// crypto.randomUUID() only exists in secure contexts (https / localhost), so
// it's undefined when testing over http on a LAN IP. Fall back to a simple id.
export function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ISO-ish datestamp, logbook style: 26.06.15
export function stamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(
    d.getDate()
  )}`;
}

function blankExtras(): Pick<
  Item,
  "priority" | "price_cents" | "url" | "notes"
> {
  return { priority: null, price_cents: null, url: null, notes: null };
}

/**
 * Shared list-item plumbing for every list type: the realtime subscription,
 * optimistic CRUD, and reconciliation. Grocery-only behavior (finishTrip,
 * templates, aisle stats) lives in GroceryList, not here.
 */
export function useListItems(
  listId: string,
  userId: string,
  initialItems: Item[]
) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[]>(initialItems);

  // Realtime: reconcile server events into local state. Optimistic rows use
  // temp ids, so a server INSERT either replaces its temp twin (matched by
  // name + creator) or appends.
  useEffect(() => {
    const channel = supabase
      .channel(`list:${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "list_items",
          filter: `list_id=eq.${listId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Item;
            setItems((prev) => {
              if (prev.some((i) => i.id === row.id)) return prev;
              const tempIdx = prev.findIndex(
                (i) =>
                  i.id.startsWith("temp-") &&
                  i.name === row.name &&
                  i.created_by === row.created_by
              );
              if (tempIdx !== -1) {
                const next = [...prev];
                next[tempIdx] = row;
                return next;
              }
              return [...prev, row];
            });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Item;
            setItems((prev) => prev.map((i) => (i.id === row.id ? row : i)));
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as Item;
            setItems((prev) => prev.filter((i) => i.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, listId]);

  async function addItem(name: string, extras: ItemExtras = {}) {
    const trimmed = name.trim();
    if (!trimmed) return;

    const tempId = `temp-${makeId()}`;
    const optimistic: Item = {
      id: tempId,
      name: trimmed,
      created_at: new Date().toISOString(),
      checked_at: null,
      checked_by: null,
      created_by: userId,
      ...blankExtras(),
      ...extras,
    };
    setItems((prev) => [...prev, optimistic]);

    const { data, error } = await supabase
      .from("list_items")
      .insert({ list_id: listId, name: trimmed, created_by: userId, ...extras })
      .select()
      .single();

    if (error) {
      setItems((prev) => prev.filter((i) => i.id !== tempId));
      return;
    }
    if (data) {
      setItems((prev) =>
        prev.some((i) => i.id === data.id)
          ? prev.filter((i) => i.id !== tempId)
          : prev.map((i) => (i.id === tempId ? (data as Item) : i))
      );
    }
  }

  async function toggleItem(item: Item) {
    if (item.id.startsWith("temp-")) return;
    const checking = !item.checked_at;
    const patch = {
      checked_at: checking ? new Date().toISOString() : null,
      checked_by: checking ? userId : null,
    };
    const before = items;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i))
    );

    const { error } = await supabase
      .from("list_items")
      .update(patch)
      .eq("id", item.id);
    if (error) setItems(before);
  }

  // Edit an item's fields (name / priority / price / url / notes) from the
  // detail sheet. Optimistic with rollback.
  async function updateItem(id: string, patch: Partial<Item>) {
    if (id.startsWith("temp-")) return;
    const before = items;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

    const { error } = await supabase
      .from("list_items")
      .update(patch)
      .eq("id", id);
    if (error) setItems(before);
  }

  // Single-item delete (the ✕ on a row).
  async function deleteItem(item: Item) {
    if (item.id.startsWith("temp-")) return;
    const before = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { error } = await supabase
      .from("list_items")
      .delete()
      .eq("id", item.id);
    if (error) setItems(before);
  }

  // Bulk delete — used by "clear completed" / "clear acquired" (todo/wishlist).
  // Grocery clears via finishTrip/record_trip instead.
  async function deleteItems(ids: string[]) {
    const realIds = ids.filter((id) => !id.startsWith("temp-"));
    if (realIds.length === 0) return;
    const before = items;
    setItems((prev) => prev.filter((i) => !realIds.includes(i.id)));

    const { error } = await supabase
      .from("list_items")
      .delete()
      .in("id", realIds);
    if (error) setItems(before);
  }

  // Promote an item to another list (e.g. wishlist -> shopping). Implemented as
  // insert-on-target + delete-on-source rather than an UPDATE of list_id: that
  // cleanly fires a DELETE on this channel and an INSERT on the target's
  // channel, and satisfies the insert RLS (the mover inserts as themselves).
  // Notes are preserved; checked state and wishlist-only fields are dropped.
  async function moveItem(item: Item, targetListId: string) {
    if (item.id.startsWith("temp-")) return;
    const before = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));

    const { error: insertError } = await supabase.from("list_items").insert({
      list_id: targetListId,
      name: item.name,
      created_by: userId,
      notes: item.notes,
    });
    if (insertError) {
      setItems(before);
      return;
    }

    const { error: deleteError } = await supabase
      .from("list_items")
      .delete()
      .eq("id", item.id);
    if (deleteError) {
      // Target copy exists but the source delete failed; restore so the user
      // can retry rather than silently losing the row.
      setItems(before);
    }
  }

  return {
    supabase,
    items,
    setItems,
    addItem,
    toggleItem,
    updateItem,
    deleteItem,
    deleteItems,
    moveItem,
  };
}
