"use client";

import { useState } from "react";
import Link from "next/link";
import { createList } from "@/app/actions";

type Props = {
  lists: { id: string; name: string }[];
  activeListId: string;
  activeListName: string;
  householdId: string;
};

export default function ListSwitcher({
  lists,
  activeListId,
  activeListName,
  householdId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  function close() {
    setOpen(false);
    setCreating(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className="t-h3 flex items-center gap-1.5 uppercase leading-tight tracking-tight active:opacity-70"
      >
        {activeListName}
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
                <li key={list.id}>
                  <Link
                    href={`/?list=${list.id}`}
                    onClick={close}
                    className={`flex items-center justify-between border-b border-[var(--ink-5)] px-3 py-2.5 text-[var(--fg)] no-underline hover:bg-[var(--paper-2)] hover:text-[var(--fg)] active:bg-[var(--paper-2)] ${
                      list.id === activeListId ? "font-bold" : ""
                    }`}
                  >
                    <span className="truncate uppercase tracking-wide">
                      {list.name}
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
                </li>
              ))}
            </ul>

            <div className="p-1.5">
              {creating ? (
                <form action={createList} className="flex gap-1.5">
                  <input type="hidden" name="household_id" value={householdId} />
                  <input
                    name="name"
                    required
                    autoFocus
                    maxLength={80}
                    placeholder="LIST NAME"
                    className="field min-w-0 flex-1 !text-sm"
                  />
                  <button type="submit" className="btn btn-sm btn-acid shrink-0">
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
