"use client";

import { useEffect, useState, useTransition } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createList, deleteList } from "@/app/actions";
import Drawer from "@/components/Drawer";
import Hint from "@/components/Hint";
import { COPY, LIST_TYPES, type ListType } from "@/lib/listTypes";

type ListSummary = {
  id: string;
  name: string;
  store_name: string | null;
  type: ListType;
};

type Props = {
  lists: ListSummary[];
  activeListId: string;
  activeListName: string;
  activeListStoreName: string | null;
  activeListType: ListType;
  householdId: string;
};

// Subtle pending dot on the row being switched to, shown while the new list's
// data loads. Must live inside the <Link>; styling lives in globals.css.
function NavHint() {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden className={`list-hint ${pending ? "is-pending" : ""}`} />
  );
}

// Submit button for the create form. useFormStatus reports the surrounding
// form's pending state, so we show progress and block a double-submit.
function CreateSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-sm btn-acid" disabled={pending}>
      {pending ? "ADDING…" : "ADD"}
    </button>
  );
}

export default function ListSwitcher({
  lists,
  activeListId,
  activeListName,
  activeListStoreName,
  activeListType,
  householdId,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<ListType>("grocery");
  const [confirmTarget, setConfirmTarget] = useState<ListSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function close() {
    setOpen(false);
    setCreating(false);
    setNewType("grocery");
  }

  // Escape closes the dropdown. While the confirm Drawer is open it owns Escape,
  // so we stand down to avoid dismissing both at once.
  useEffect(() => {
    if (!open || confirmTarget) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, confirmTarget]);

  function requestDelete(list: ListSummary) {
    setDeleteError(null);
    setConfirmTarget(list);
  }

  function cancelDelete() {
    if (isDeleting) return;
    setConfirmTarget(null);
    setDeleteError(null);
  }

  // When the active list is the one being removed, hand off to a neighbor (the
  // previous list, else the first remaining) so we never land on a stale view.
  function neighborId(deletedId: string): string | null {
    const idx = lists.findIndex((l) => l.id === deletedId);
    const prev = lists[idx - 1];
    if (prev) return prev.id;
    return lists.find((l) => l.id !== deletedId)?.id ?? null;
  }

  function confirmDelete() {
    const target = confirmTarget;
    if (!target) return;
    setDeleteError(null);
    startDelete(async () => {
      try {
        await deleteList(target.id);
      } catch {
        setDeleteError("Couldn't delete that list. Try again.");
        return;
      }
      // Deleting a background list keeps you where you are; deleting the active
      // one hands off to a neighbor. (Fixes the old "always jump to default" bug.)
      if (target.id === activeListId) {
        const next = neighborId(target.id);
        router.push(next ? `/?list=${next}` : "/");
        close();
      } else {
        router.refresh();
      }
      setConfirmTarget(null);
    });
  }

  const canDelete = lists.length > 1;

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className="t-h3 flex items-center gap-1.5 uppercase leading-tight tracking-tight active:opacity-70"
      >
        <span className="flex items-center gap-1.5">
          <span className="t-stamp text-[var(--fg-muted)]">
            {COPY[activeListType].tag}
          </span>
          {activeListName}
          {activeListStoreName && (
            <span className="ml-1.5 text-sm font-normal text-[var(--fg-disabled)]">
              {activeListStoreName}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className={`text-xs text-[var(--fg-muted)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" aria-hidden onClick={close} />
          <div className="panel panel-stamp absolute left-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))]">
            <div className="panel-head">
              <span>[LISTS]</span>
              <span>{String(lists.length).padStart(2, "0")}</span>
            </div>
            <ul className="flex flex-col">
              {lists.map((list) => {
                const active = list.id === activeListId;
                return (
                  <li key={list.id} className="flex items-center">
                    <Link
                      href={`/?list=${list.id}`}
                      prefetch={false}
                      // Switching to another list keeps the menu open so the
                      // NavHint is visible; the page remount on arrival resets it.
                      // Tapping the active list just closes the menu (no nav).
                      onClick={() => {
                        if (active) close();
                      }}
                      className={`flex flex-1 items-center gap-2 border-b border-[var(--ink-5)] px-3 py-2.5 text-[var(--fg)] no-underline hover:bg-[var(--paper-2)] hover:text-[var(--fg)] active:bg-[var(--paper-2)] ${
                        active ? "font-bold" : ""
                      }`}
                    >
                      <span className="t-stamp shrink-0 text-[var(--fg-muted)]">
                        {COPY[list.type].tag}
                      </span>
                      <span className="flex-1 truncate uppercase tracking-wide">
                        {list.name}
                        {list.store_name && (
                          <span className="ml-1.5 normal-case tracking-normal text-[var(--fg-2)]">
                            {list.store_name}
                          </span>
                        )}
                      </span>
                      {active ? (
                        <span
                          aria-hidden
                          className="text-sm text-[var(--cobalt)]"
                        >
                          ▸
                        </span>
                      ) : (
                        <NavHint />
                      )}
                    </Link>
                    {canDelete && (
                      <button
                        onClick={() => requestDelete(list)}
                        aria-label={`Delete ${list.name}`}
                        className="px-2 py-2.5 text-sm text-[var(--fg-disabled)] active:text-[var(--term-red)]"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="p-1.5">
              {creating ? (
                <form action={createList} className="flex flex-col gap-1.5">
                  <input type="hidden" name="household_id" value={householdId} />
                  <input type="hidden" name="type" value={newType} />

                  <div className="flex gap-1">
                    {LIST_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewType(t)}
                        className={`btn btn-sm flex-1 ${
                          newType === t ? "btn-acid" : ""
                        }`}
                      >
                        {COPY[t].tag}
                      </button>
                    ))}
                  </div>
                  <Hint motion="idle" className="px-0">
                    GRO sorts by aisle · TODO &amp; WISH rank by priority
                  </Hint>

                  <input
                    name="name"
                    required
                    autoFocus
                    maxLength={80}
                    placeholder="LIST NAME"
                    className="field !text-sm"
                  />
                  {newType === "grocery" && (
                    <input
                      name="store_name"
                      maxLength={80}
                      placeholder="Store (optional)"
                      className="field !text-sm"
                    />
                  )}
                  <CreateSubmit />
                </form>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="t-meta flex w-full items-center gap-2 px-2 py-2 text-[var(--fg-2)] active:bg-[var(--paper-2)]"
                >
                  [+ NEW LIST]
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <Drawer
        open={confirmTarget !== null}
        onClose={cancelDelete}
        title="DELETE LIST"
        code="[!]"
      >
        {confirmTarget && (
          <div className="flex flex-col gap-4">
            <p className="t-body">
              Delete{" "}
              <span className="font-bold uppercase">
                {COPY[confirmTarget.type].tag} {confirmTarget.name}
              </span>
              ? All items in it will be permanently removed.
            </p>
            {deleteError && (
              <p className="t-small text-[var(--term-red)]">
                {"// "}
                {deleteError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={isDeleting}
                className="btn btn-sm flex-1"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="btn btn-sm btn-danger flex-1"
              >
                {isDeleting ? "DELETING…" : "DELETE"}
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
