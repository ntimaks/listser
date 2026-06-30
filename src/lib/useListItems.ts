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
  // (price/url) and shared by todo+wishlist (notes). `priority` is legacy
  // (replaced by `importance` in 0007) and no longer surfaced in the UI.
  priority: "soon" | "someday" | null;
  price_cents: number | null;
  url: string | null;
  notes: string | null;
  // 1–5 rankable attributes added in 0007, shared by todo + wishlist.
  importance: number | null;
  effort: number | null;
  // 0010: non-null on a subtask, pointing at its parent list_item (todo only).
  parent_item_id: string | null;
};

// Fields a caller may set when creating an item (wishlist add, subtask, etc.).
export type ItemExtras = Partial<
  Pick<
    Item,
    | "priority"
    | "price_cents"
    | "url"
    | "notes"
    | "importance"
    | "effort"
    | "parent_item_id"
  >
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
  | "priority"
  | "price_cents"
  | "url"
  | "notes"
  | "importance"
  | "effort"
  | "parent_item_id"
> {
  return {
    priority: null,
    price_cents: null,
    url: null,
    notes: null,
    importance: null,
    effort: null,
    parent_item_id: null,
  };
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
                  i.created_by === row.created_by &&
                  i.parent_item_id === row.parent_item_id
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

  // Bulk checked-state writer for to-do subtasks. The caller (SubtaskGroup)
  // computes the full set of rows to flip so the parent/subtask invariant —
  // "a parent is checked iff it has subtasks and all are checked" — is applied
  // atomically: a leaf toggle may also flip its parent, a parent toggle flips
  // all its children, and reopening a parent flips just the parent. Optimistic
  // with rollback; checked/unchecked rows are grouped into one update each.
  async function setChecked(updates: { id: string; checked: boolean }[]) {
    const real = updates.filter((u) => !u.id.startsWith("temp-"));
    if (real.length === 0) return;

    const now = new Date().toISOString();
    const byId = new Map(real.map((u) => [u.id, u.checked]));
    const before = items;
    setItems((prev) =>
      prev.map((i) =>
        byId.has(i.id)
          ? {
              ...i,
              checked_at: byId.get(i.id) ? now : null,
              checked_by: byId.get(i.id) ? userId : null,
            }
          : i
      )
    );

    const checkedIds = real.filter((u) => u.checked).map((u) => u.id);
    const uncheckedIds = real.filter((u) => !u.checked).map((u) => u.id);
    const results = await Promise.all([
      checkedIds.length
        ? supabase
            .from("list_items")
            .update({ checked_at: now, checked_by: userId })
            .in("id", checkedIds)
        : Promise.resolve({ error: null }),
      uncheckedIds.length
        ? supabase
            .from("list_items")
            .update({ checked_at: null, checked_by: null })
            .in("id", uncheckedIds)
        : Promise.resolve({ error: null }),
    ]);
    if (results.some((r) => r.error)) setItems(before);
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

  // Single-item delete (the ✕ on a row). Deleting a parent drops its subtasks
  // too: the DB cascade handles the server, and we mirror it locally so the
  // children don't flash before their realtime DELETE events arrive.
  async function deleteItem(item: Item) {
    if (item.id.startsWith("temp-")) return;
    const before = items;
    setItems((prev) =>
      prev.filter((i) => i.id !== item.id && i.parent_item_id !== item.id)
    );
    const { error } = await supabase
      .from("list_items")
      .delete()
      .eq("id", item.id);
    if (error) setItems(before);
  }

  // Bulk delete — used by "clear completed" / "clear acquired" (todo/wishlist).
  // Grocery clears via finishTrip/record_trip instead. Children of a cleared
  // parent go with it (DB cascade) so mirror that in the optimistic filter.
  async function deleteItems(ids: string[]) {
    const realIds = ids.filter((id) => !id.startsWith("temp-"));
    if (realIds.length === 0) return;
    const idSet = new Set(realIds);
    const before = items;
    setItems((prev) =>
      prev.filter(
        (i) =>
          !idSet.has(i.id) &&
          !(i.parent_item_id != null && idSet.has(i.parent_item_id))
      )
    );

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
    setChecked,
    updateItem,
    deleteItem,
    deleteItems,
    moveItem,
  };
}
