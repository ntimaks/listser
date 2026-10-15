"use client";

import type { Dispatch, SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DueFields, ItemPatch } from "@/lib/recurrence";
import { makeId } from "@/lib/id";
import { enqueue, type NewRow } from "@/lib/outbox";

export type ItemSource = "user" | "assistant";

export type Item = {
  id: string;
  name: string;
  created_at: string;
  checked_at: string | null;
  checked_by: string | null;
  created_by: string;
  // 0017: "assistant" when an AI added it for created_by over MCP. Absent on
  // rows added here (the column defaults to "user") and before 0017.
  source?: ItemSource;
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
 * Shared list-item plumbing for every list type. Each change goes into the
 * write queue (outbox), which shows it on screen at once and sends it when it
 * can, so all of these work offline. The items live in the list cache
 * (useListStore), which also keeps them in sync over realtime. Grocery-only
 * behavior (finishTrip, templates, aisle stats) lives in GroceryList.
 */
export function useListItems(
  supabase: SupabaseClient,
  listId: string,
  userId: string,
  items: Item[],
  setItems: Dispatch<SetStateAction<Item[]>>
) {
  function newRow(name: string, extras: ItemExtras, list = listId): NewRow {
    return {
      id: makeId(),
      list_id: list,
      name,
      created_at: new Date().toISOString(),
      checked_at: null,
      checked_by: null,
      created_by: userId,
      ...blankExtras(),
      ...extras,
    };
  }

  // Add several items in one insert (a template, or a single add).
  function addItems(entries: { name: string; extras?: ItemExtras }[]) {
    const rows = entries
      .map(({ name, extras = {} }) => newRow(name.trim(), extras))
      .filter((r) => r.name);
    if (rows.length > 0) enqueue({ kind: "insert", rows });
  }

  function addItem(name: string, extras: ItemExtras = {}) {
    addItems([{ name, extras }]);
  }

  function toggleItem(item: Item) {
    const checking = !item.checked_at;
    enqueue({
      kind: "update",
      ids: [item.id],
      patch: {
        checked_at: checking ? new Date().toISOString() : null,
        checked_by: checking ? userId : null,
      },
    });
  }

  // Bulk checked-state writer for to-do subtasks. The caller (SubtaskGroup)
  // computes the full set of rows to flip so the parent/subtask invariant —
  // "a parent is checked iff it has subtasks and all are checked" — is applied
  // atomically: a leaf toggle may also flip its parent, a parent toggle flips
  // all its children, and reopening a parent flips just the parent. Checked
  // and unchecked rows are grouped into one update each.
  function setChecked(updates: { id: string; checked: boolean }[]) {
    const now = new Date().toISOString();
    const checkedIds = updates.filter((u) => u.checked).map((u) => u.id);
    const uncheckedIds = updates.filter((u) => !u.checked).map((u) => u.id);
    if (checkedIds.length) {
      enqueue({
        kind: "update",
        ids: checkedIds,
        patch: { checked_at: now, checked_by: userId },
      });
    }
    if (uncheckedIds.length) {
      enqueue({
        kind: "update",
        ids: uncheckedIds,
        patch: { checked_at: null, checked_by: null },
      });
    }
  }

  // Edit an item's fields (name / price / url / notes / due date…) from the
  // detail sheet.
  function updateItem(id: string, patch: Partial<Item>) {
    enqueue({ kind: "update", ids: [id], patch });
  }

  // Apply a batch of per-row patches, e.g. the recurring-task rollover from
  // planRollover. Rows sharing an identical patch go out as one update.
  function patchItems(updates: ItemPatch[]) {
    const groups = new Map<string, string[]>();
    for (const u of updates) {
      const key = JSON.stringify(u.patch);
      groups.set(key, [...(groups.get(key) ?? []), u.id]);
    }
    for (const [key, ids] of groups) {
      enqueue({ kind: "update", ids, patch: JSON.parse(key) });
    }
  }

  // Single-item delete (the ✕ on a row). Deleting a parent drops its subtasks
  // too: the DB cascade handles the server, and the outbox mirrors it locally.
  function deleteItem(item: Item) {
    enqueue({ kind: "delete", ids: [item.id] });
  }

  // Bulk delete — used by "clear completed" / "clear acquired" (todo/wishlist).
  // Grocery clears via finishTrip/record_trip instead.
  function deleteItems(ids: string[]) {
    if (ids.length > 0) enqueue({ kind: "delete", ids });
  }

  // Promote an item to another list (e.g. wishlist -> shopping). Implemented as
  // insert-on-target + delete-on-source rather than an UPDATE of list_id: that
  // cleanly fires a DELETE on this channel and an INSERT on the target's
  // channel, and satisfies the insert RLS (the mover inserts as themselves).
  // Notes are preserved; checked state and wishlist-only fields are dropped.
  function moveItem(item: Item, targetListId: string) {
    enqueue({
      kind: "insert",
      rows: [newRow(item.name, { notes: item.notes }, targetListId)],
    });
    enqueue({ kind: "delete", ids: [item.id] });
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
