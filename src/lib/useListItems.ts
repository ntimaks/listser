"use client";

import { useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DueFields, ItemPatch } from "@/lib/recurrence";

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
} & DueFields; // 0011: due date + repeat (top-level todo only).

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
    | keyof DueFields
  >
>;

// A v4 uuid, usable as a row id. crypto.randomUUID() only exists in secure
// contexts (https / localhost), so it's undefined when testing over http on a
// LAN IP; getRandomValues works everywhere.
export function makeId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20
  )}-${h.slice(20)}`;
}

// Inserts still on their way to the server, by item id. Ids are made here
// rather than by the database, so a new row can be checked off, edited or
// deleted right away: those writes wait for its insert first. Each promise
// resolves to whether the insert saved.
const inserting = new Map<string, Promise<boolean>>();
const insertListeners = new Set<() => void>();

function trackInserts(ids: string[], done: Promise<boolean>) {
  for (const id of ids) inserting.set(id, done);
  insertListeners.forEach((l) => l());
  done.finally(() => {
    for (const id of ids) inserting.delete(id);
    insertListeners.forEach((l) => l());
  });
}

/** Whether this item's insert hasn't reached the server yet. */
export function isInserting(id: string) {
  return inserting.has(id);
}

/** isInserting, re-rendering when it changes. */
export function useInserting(id: string) {
  return useSyncExternalStore(
    (l) => {
      insertListeners.add(l);
      return () => insertListeners.delete(l);
    },
    () => inserting.has(id),
    () => false
  );
}

// The ids whose rows exist on the server, once any pending inserts settle. A
// row whose insert failed is gone from the list already, so writes skip it.
async function saved(ids: (string | null)[]) {
  const ok = await Promise.all(
    ids.map((id) => (id && inserting.get(id)) || true)
  );
  return ids.filter((id, k): id is string => id != null && ok[k]);
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
  | keyof DueFields
> {
  return {
    priority: null,
    price_cents: null,
    url: null,
    notes: null,
    importance: null,
    effort: null,
    parent_item_id: null,
    due_on: null,
    repeat_every: null,
    repeat_unit: null,
    repeat_from: null,
  };
}

// Fold a realtime INSERT into a list's items. Optimistic rows carry their real
// id, so our own inserts echo back as rows we already hold; those keep their
// local state, which may include edits made since.
export function reconcileInsert(prev: Item[], row: Item): Item[] {
  if (prev.some((i) => i.id === row.id)) return prev;
  return [...prev, row];
}

/**
 * Shared list-item plumbing for every list type: optimistic CRUD with
 * rollback. The items live in the list cache (useListStore), which also keeps
 * them in sync over realtime, so switching lists keeps every edit. Grocery-only
 * behavior (finishTrip, templates, aisle stats) lives in GroceryList.
 */
export function useListItems(
  supabase: SupabaseClient,
  listId: string,
  userId: string,
  items: Item[],
  setItems: Dispatch<SetStateAction<Item[]>>
) {
  // Add several items in one insert (a template, or a single add). Optimistic
  // with rollback; the rows carry their final ids from the start.
  async function addItems(entries: { name: string; extras?: ItemExtras }[]) {
    const now = new Date().toISOString();
    const rows = entries
      .map(({ name, extras = {} }) => ({
        id: makeId(),
        name: name.trim(),
        ...extras,
      }))
      .filter((r) => r.name);
    if (rows.length === 0) return;

    const ids = rows.map((r) => r.id);
    setItems((prev) => [
      ...prev,
      ...rows.map((r) => ({
        created_at: now,
        checked_at: null,
        checked_by: null,
        created_by: userId,
        ...blankExtras(),
        ...r,
      })),
    ]);

    const done = (async () => {
      // A subtask's parent may itself still be on its way.
      const parents = rows.map((r) => r.parent_item_id ?? null);
      const parentsSaved = await saved(parents);
      if (parentsSaved.length < parents.filter(Boolean).length) return false;
      const { error } = await supabase
        .from("list_items")
        .insert(
          rows.map((r) => ({ ...r, list_id: listId, created_by: userId }))
        );
      return !error;
    })();
    trackInserts(ids, done);

    if (!(await done)) {
      const idSet = new Set(ids);
      setItems((prev) => prev.filter((i) => !idSet.has(i.id)));
    }
  }

  async function addItem(name: string, extras: ItemExtras = {}) {
    await addItems([{ name, extras }]);
  }

  async function toggleItem(item: Item) {
    const checking = !item.checked_at;
    const patch = {
      checked_at: checking ? new Date().toISOString() : null,
      checked_by: checking ? userId : null,
    };
    const before = items;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i))
    );

    if ((await saved([item.id])).length === 0) return;
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
    if (updates.length === 0) return;
    const now = new Date().toISOString();
    const byId = new Map(updates.map((u) => [u.id, u.checked]));
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

    const ids = await saved(updates.map((u) => u.id));
    const checkedIds = ids.filter((id) => byId.get(id));
    const uncheckedIds = ids.filter((id) => !byId.get(id));
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

  // Edit an item's fields (name / price / url / notes / due date…) from the
  // detail sheet. Optimistic with rollback; resolves to whether it saved.
  async function updateItem(id: string, patch: Partial<Item>) {
    const before = items;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

    if ((await saved([id])).length === 0) return false;
    const { error } = await supabase
      .from("list_items")
      .update(patch)
      .eq("id", id);
    if (error) setItems(before);
    return !error;
  }

  // Apply a batch of per-row patches, e.g. the recurring-task rollover from
  // planRollover. Rows sharing an identical patch go out as one update.
  // Optimistic with rollback.
  async function patchItems(updates: ItemPatch[]) {
    if (updates.length === 0) return;
    const byId = new Map(updates.map((u) => [u.id, u.patch]));
    const before = items;
    setItems((prev) =>
      prev.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id) } : i))
    );

    const groups = new Map<string, string[]>();
    for (const id of await saved(updates.map((u) => u.id))) {
      const key = JSON.stringify(byId.get(id));
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    const results = await Promise.all(
      [...groups].map(([key, ids]) =>
        supabase.from("list_items").update(JSON.parse(key)).in("id", ids)
      )
    );
    if (results.some((r) => r.error)) setItems(before);
  }

  // Single-item delete (the ✕ on a row). Deleting a parent drops its subtasks
  // too: the DB cascade handles the server, and we mirror it locally so the
  // children don't flash before their realtime DELETE events arrive.
  async function deleteItem(item: Item) {
    const before = items;
    setItems((prev) =>
      prev.filter((i) => i.id !== item.id && i.parent_item_id !== item.id)
    );
    if ((await saved([item.id])).length === 0) return;    const { error } = await supabase
      .from("list_items")
      .delete()
      .eq("id", item.id);
    if (error) setItems(before);
  }

  // Bulk delete — used by "clear completed" / "clear acquired" (todo/wishlist).
  // Grocery clears via finishTrip/record_trip instead. Children of a cleared
  // parent go with it (DB cascade) so mirror that in the optimistic filter.
  async function deleteItems(ids: string[]) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const before = items;
    setItems((prev) =>
      prev.filter(
        (i) =>
          !idSet.has(i.id) &&
          !(i.parent_item_id != null && idSet.has(i.parent_item_id))
      )
    );

    const realIds = await saved(ids);
    if (realIds.length === 0) return;
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
    const before = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    if ((await saved([item.id])).length === 0) return;

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
    addItems,
    toggleItem,
    setChecked,
    updateItem,
    patchItems,
    deleteItem,
    deleteItems,
    moveItem,
  };
}
