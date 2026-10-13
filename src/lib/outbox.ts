"use client";

import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { idbGet, idbSet } from "@/lib/idb";
import { makeId } from "@/lib/id";
import type { Item } from "@/lib/useListItems";

/**
 * The write queue. Every change to list items goes through here: it shows on
 * screen at once (the list store applies each op as it's queued), is saved on
 * the device, and is sent to the server in order, one at a time, retrying
 * while there's no connection. So adds and check-offs work in a supermarket
 * with no signal, and land once the phone is back online, even after the app
 * was closed in between.
 *
 * Ops run in the order they were made, so a subtask's insert follows its
 * parent's and a check-off follows its item's insert. One the server refuses
 * (a deleted list, say) is dropped, and the lists reload from the server.
 */

export type NewRow = Item & { list_id: string };

type OpBody =
  | { kind: "insert"; rows: NewRow[] }
  | { kind: "update"; ids: string[]; patch: Partial<Item> }
  | { kind: "delete"; ids: string[] }
  // `removes`: item ids the call deletes, e.g. record_trip's checked items.
  | {
      kind: "rpc";
      fn: string;
      args: Record<string, unknown>;
      removes?: string[];
    };
export type Op = OpBody & { id: string };

// Sent ops stay overlaid on reloads for a while: a reload that started before
// the write landed would otherwise briefly show the old row.
const RECENT_MS = 10_000;

let client: SupabaseClient | null = null;
let storageKey: string | null = null;
let loaded = false;
let ops: Op[] = [];
let recent: { op: Op; at: number }[] = [];
const waiters = new Map<string, (ok: boolean) => void>();
let onApply: ((ops: Op[]) => void) | null = null;
let onReject: (() => void) | null = null;

let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 2000;
let offline = false;

type Status = { pending: number; offline: boolean };
let status: Status = { pending: 0, offline: false };
const listeners = new Set<() => void>();

function changed() {
  status = { pending: ops.length, offline };
  listeners.forEach((l) => l());
}

function persist() {
  if (loaded && storageKey) idbSet(storageKey, ops);
}

/**
 * Bind the queue to the signed-in user and the list store. Loads ops left
 * over from an earlier visit (they go first) and starts sending.
 */
export function startOutbox(opts: {
  supabase: SupabaseClient;
  userId: string;
  /** Apply ops to what's on screen: new ones, and ones loaded from disk. */
  onApply: (ops: Op[]) => void;
  /** The server refused an op; reload so the screen shows what it has. */
  onReject: () => void;
}) {
  client = opts.supabase;
  onApply = opts.onApply;
  onReject = opts.onReject;

  const key = `outbox:${opts.userId}`;
  if (storageKey !== key) {
    storageKey = key;
    loaded = false;
    idbGet<Op[]>(key).then((saved) => {
      if (storageKey !== key) return;
      const known = new Set(ops.map((o) => o.id));
      const left = (saved ?? []).filter((o) => !known.has(o.id));
      ops = [...left, ...ops];
      loaded = true;
      persist();
      changed();
      if (left.length) onApply?.(left);
      flush();
    });
  }

  const wake = () => {
    if (document.visibilityState === "visible") flush();
  };
  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", wake);
  flush();
  return () => {
    window.removeEventListener("online", flush);
    document.removeEventListener("visibilitychange", wake);
    onApply = null;
    onReject = null;
  };
}

/** Drop everything queued, e.g. on sign-out. */
export function resetOutbox() {
  ops = [];
  recent = [];
  storageKey = null;
  loaded = false;
  offline = false;
  waiters.forEach((resolve) => resolve(false));
  waiters.clear();
  changed();
}

/**
 * Queue a change. It's applied on screen right away; the promise settles once
 * the server has it (true) or refused it (false), in this visit only.
 */
export function enqueue(body: OpBody): Promise<boolean> {
  const op = { ...body, id: makeId() } as Op;
  ops = [...ops, op];
  persist();
  changed();
  onApply?.([op]);
  const done = new Promise<boolean>((resolve) => waiters.set(op.id, resolve));
  flush();
  return done;
}

/** Ops not sent yet, oldest first. */
export function pendingOps() {
  return ops;
}

/** Ops to lay over freshly loaded rows: recently sent ones, then pending. */
export function overlayOps() {
  const cutoff = Date.now() - RECENT_MS;
  recent = recent.filter((r) => r.at > cutoff);
  return [...recent.map((r) => r.op), ...ops];
}

// No connection, timeouts, rate limits, server trouble, and an expired
// session (supabase-js refreshes it) are worth retrying. Anything else is the
// server saying no.
function retryable(status: number) {
  return (
    status === 0 ||
    status === 401 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

async function send(
  supabase: SupabaseClient,
  op: Op
): Promise<{ error: { message: string } | null; status: number }> {
  try {
    const items = () => supabase.from("list_items");
    switch (op.kind) {
      case "insert":
        // An insert whose reply got lost may already be in: skip, don't fail.
        return await items().upsert(op.rows, {
          onConflict: "id",
          ignoreDuplicates: true,
        });
      case "update":
        return await items().update(op.patch).in("id", op.ids);
      case "delete":
        return await items().delete().in("id", op.ids);
      case "rpc":
        return await supabase.rpc(op.fn, op.args);
    }
  } catch (e) {
    return { error: { message: String(e) }, status: 0 };
  }
}

async function flush() {
  if (flushing || !loaded || !client) return;
  clearTimeout(retryTimer);
  if (!navigator.onLine) {
    // The online event will wake us.
    if (ops.length && !offline) {
      offline = true;
      changed();
    }
    return;
  }

  flushing = true;
  try {
    while (ops.length > 0) {
      const op = ops[0];
      const { error, status } = await send(client, op);
      if (error && retryable(status)) {
        offline = true;
        changed();
        retryTimer = setTimeout(flush, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60_000);
        return;
      }
      if (error) {
        console.error("The server refused a change, dropping it:", error, op);
      } else {
        recent.push({ op, at: Date.now() });
      }
      ops = ops.filter((o) => o.id !== op.id);
      offline = false;
      retryDelay = 2000;
      persist();
      changed();
      waiters.get(op.id)?.(!error);
      waiters.delete(op.id);
      if (error) onReject?.();
    }
  } finally {
    flushing = false;
  }
}

/**
 * Lay ops over one list's items: queued inserts are added, updates patched
 * in, deletes removed (with subtasks, like the database cascade). Safe to
 * apply again. Returns the same array when nothing changes.
 */
export function applyOps(items: Item[], listId: string, list: Op[]): Item[] {
  let out = items;
  for (const op of list) {
    if (op.kind === "insert") {
      const have = new Set(out.map((i) => i.id));
      const add = op.rows.filter(
        (r) => r.list_id === listId && !have.has(r.id)
      );
      if (add.length) out = [...out, ...add];
    } else if (op.kind === "update") {
      const ids = new Set(op.ids);
      if (out.some((i) => ids.has(i.id))) {
        out = out.map((i) => (ids.has(i.id) ? { ...i, ...op.patch } : i));
      }
    } else {
      const ids = new Set(op.kind === "delete" ? op.ids : (op.removes ?? []));
      const gone = (i: Item) =>
        ids.has(i.id) ||
        (i.parent_item_id != null && ids.has(i.parent_item_id));
      if (out.some(gone)) out = out.filter((i) => !gone(i));
    }
  }
  return out;
}

/** Whether this item's insert is still waiting to be sent. */
export function isInserting(id: string) {
  return ops.some(
    (o) => o.kind === "insert" && o.rows.some((r) => r.id === id)
  );
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** isInserting, re-rendering when it changes. */
export function useInserting(id: string) {
  return useSyncExternalStore(
    subscribe,
    () => isInserting(id),
    () => false
  );
}

/** How many changes are waiting, and whether the last try had no connection. */
export function useOutboxStatus() {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => status
  );
}
