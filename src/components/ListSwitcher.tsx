"use client";

import { useState, useTransition } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createList, deleteList } from "@/app/actions";
import Drawer from "@/components/Drawer";
import Hint from "@/components/Hint";
import { COPY, LIST_TYPES, type ListType } from "@/lib/listTypes";
import type { ListSummary } from "@/lib/household";

type Props = {
  lists: ListSummary[];
  activeListId: string;
  /** Unchecked items per list, as of page load. */
  openCounts: Record<string, number>;
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
    <button type="submit" className="btn btn-acid" disabled={pending}>
      {pending ? "ADDING…" : "ADD"}
    </button>
  );
}

export default function ListSwitcher({
  lists,
  activeListId,
  openCounts,
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

  // The delete confirm is a second Drawer stacked on this one; while it is up
  // it owns Escape/backdrop, so the list sheet ignores close requests.
  function closeSheet() {
    if (confirmTarget) return;
    close();
  }

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
  const activeIndex = Math.max(
    0,
    lists.findIndex((l) => l.id === activeListId)
  );
  const active = lists[activeIndex];

  return (
    <div className="flex min-w-0 flex-1">
      {/* The whole name block is the switcher; the lime end says what it does. */}
      <button
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Switch list. Current: ${active?.name ?? ""}`}
        className="flex min-w-0 flex-1 items-stretch border border-[var(--ink-0)] bg-[var(--paper-0)] text-left text-[var(--fg)] shadow-[var(--sh-stamp)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-2">
          {active && (
            <span className="t-meta truncate">
              {COPY[active.type].label}
              {active.store_name && ` · ${active.store_name}`} ·{" "}
              {activeIndex + 1}/{lists.length}
            </span>
          )}
          <span className="font-[family-name:var(--ff-display)] text-[22px] leading-[1.1] font-bold tracking-tight uppercase [overflow-wrap:anywhere]">
            {active?.name}
          </span>
        </span>
        <span className="flex w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-[var(--ink-0)] bg-[var(--acid)] text-[var(--on-acid)]">
          <span aria-hidden className="text-base leading-none">
            ⇅
          </span>
          <span className="text-[9px] font-bold tracking-[0.1em]">LISTS</span>
        </span>
      </button>

      <Drawer
        open={open}
        onClose={closeSheet}
        title="LISTS"
        code={String(lists.length).padStart(2, "0")}
      >
        <div className="-mx-[var(--s-4)] -mt-[var(--s-4)]">
          {LIST_TYPES.map((type) => {
            const group = lists.filter((l) => l.type === type);
            if (group.length === 0) return null;
            return (
              <section key={type}>
                <h3 className="t-meta border-b border-[var(--ink-5)] bg-[var(--paper-2)] px-4 py-1.5">
                  {COPY[type].label}
                </h3>
                <ul className="flex flex-col">
                  {group.map((list) => {
                    const active = list.id === activeListId;
                    const openCount = openCounts[list.id] ?? 0;
                    return (
                      <li
                        key={list.id}
                        className={`flex items-stretch ${active ? "bg-[var(--acid)] text-[var(--on-acid)]" : ""}`}
                      >
                        <Link
                          href={`/?list=${list.id}`}
                          prefetch={false}
                          // Switching to another list keeps the menu open so the
                          // NavHint is visible; the page remount on arrival resets it.
                          // Tapping the active list just closes the menu (no nav).
                          onClick={() => {
                            if (active) close();
                          }}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-14 min-w-0 flex-1 items-center gap-2 border-b border-[var(--ink-5)] px-4 py-2 no-underline! ${
                            active
                              ? // ! beats the global link color, which is near-white in dark mode.
                                "text-[var(--on-acid)]! hover:bg-[var(--acid)]! hover:text-[var(--on-acid)]!"
                              : "text-[var(--fg)] hover:bg-[var(--paper-2)]! hover:text-[var(--fg)]! active:bg-[var(--paper-2)]"
                          }`}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="font-bold tracking-wide uppercase [overflow-wrap:anywhere]">
                              {list.name}
                            </span>
                            <span className="t-small opacity-80">
                              {list.store_name && `${list.store_name} · `}
                              {/* The active list's count would be stale once
                                  you add items, so it just says you're on it. */}
                              {active ? "open now" : `${openCount} ${COPY[type].openNoun}`}
                            </span>
                          </span>
                          {active ? (
                            <span aria-hidden className="text-sm">
                              ●
                            </span>
                          ) : (
                            <NavHint />
                          )}
                        </Link>
                        {canDelete && (
                          <button
                            onClick={() => requestDelete(list)}
                            aria-label={`Delete ${list.name}`}
                            className={`flex w-12 shrink-0 items-center justify-center border-b border-l border-[var(--ink-5)] text-sm active:text-[var(--term-red)] ${
                              active ? "text-[var(--on-acid)]" : "text-[var(--fg-2)]"
                            }`}
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <div className="p-3">
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
                  className="field"
                />
                {newType === "grocery" && (
                  <input
                    name="store_name"
                    maxLength={80}
                    placeholder="Store (optional)"
                    className="field"
                  />
                )}
                <CreateSubmit />
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="btn btn-ghost w-full"
              >
                [+ NEW LIST]
              </button>
            )}
          </div>
        </div>
      </Drawer>

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
