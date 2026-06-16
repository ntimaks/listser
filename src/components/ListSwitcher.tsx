"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createList, deleteList } from "@/app/actions";

type Props = {
  lists: { id: string; name: string; store_name: string | null }[];
  activeListId: string;
  activeListName: string;
  activeListStoreName: string | null;
  householdId: string;
};

export default function ListSwitcher({
  lists,
  activeListId,
  activeListName,
  activeListStoreName,
  householdId,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  function close() {
    setOpen(false);
    setCreating(false);
  }

  async function handleDeleteList(
    listId: string,
    listName: string
  ) {
    if (
      !window.confirm(
        `Delete "${listName}"? All items in it will be removed.`
      )
    )
      return;
    close();
    await deleteList(listId);
    router.push("/");
    router.refresh();
  }

  const canDelete = lists.length > 1;

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className="t-h3 flex items-center gap-1.5 uppercase leading-tight tracking-tight active:opacity-70"
      >
        <span>
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
          <div className="panel panel-stamp absolute left-0 top-full z-30 mt-2 w-64">
            <div className="panel-head">
              <span>[LISTS]</span>
              <span>{String(lists.length).padStart(2, "0")}</span>
            </div>
            <ul className="flex flex-col">
              {lists.map((list) => (
                <li key={list.id} className="flex items-center">
                  <Link
                    href={`/?list=${list.id}`}
                    onClick={close}
                    className={`flex flex-1 items-center justify-between border-b border-[var(--ink-5)] px-3 py-2.5 text-[var(--fg)] no-underline hover:bg-[var(--paper-2)] hover:text-[var(--fg)] active:bg-[var(--paper-2)] ${
                      list.id === activeListId ? "font-bold" : ""
                    }`}
                  >
                    <span className="truncate uppercase tracking-wide">
                      {list.name}
                      {list.store_name && (
                        <span className="ml-1.5 normal-case tracking-normal text-[var(--fg-2)]">
                          {list.store_name}
                        </span>
                      )}
                    </span>
                    {list.id === activeListId && (
                      <span
                        aria-hidden
                        className="text-sm text-[var(--cobalt)]"
                      >
                        ▸
                      </span>
                    )}
                  </Link>
                  {canDelete && (
                    <button
                      onClick={() => handleDeleteList(list.id, list.name)}
                      aria-label={`Delete ${list.name}`}
                      className="px-2 py-2.5 text-sm text-[var(--fg-disabled)] active:text-[var(--term-red)]"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="p-1.5">
              {creating ? (
                <form action={createList} className="flex flex-col gap-1.5">
                  <input type="hidden" name="household_id" value={householdId} />
                  <input
                    name="name"
                    required
                    autoFocus
                    maxLength={80}
                    placeholder="LIST NAME"
                    className="field !text-sm"
                  />
                  <input
                    name="store_name"
                    maxLength={80}
                    placeholder="Store (optional)"
                    className="field !text-sm"
                  />
                  <button type="submit" className="btn btn-sm btn-acid">
                    ADD
                  </button>
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
    </div>
  );
}
