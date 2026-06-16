"use client";

import { useState } from "react";
import Link from "next/link";
import { createList } from "@/app/actions";

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
        className="flex items-center gap-1.5 rounded-lg py-0.5 text-xl font-bold leading-tight active:opacity-70"
      >
        <span>
          {activeListName}
          {activeListStoreName && (
            <span className="ml-1.5 text-sm font-normal text-neutral-400">
              {activeListStoreName}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className={`text-xs text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            aria-hidden
            onClick={close}
          />
          <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-neutral-300 bg-background p-1.5 shadow-lg dark:border-neutral-700">
            <ul className="flex flex-col">
              {lists.map((list) => (
                <li key={list.id}>
                  <Link
                    href={`/?list=${list.id}`}
                    onClick={close}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-base active:bg-neutral-100 dark:active:bg-neutral-800 ${
                      list.id === activeListId ? "font-semibold" : ""
                    }`}
                  >
                    <span>
                      {list.name}
                      {list.store_name && (
                        <span className="ml-1.5 text-sm font-normal text-neutral-400">
                          {list.store_name}
                        </span>
                      )}
                    </span>
                    {list.id === activeListId && (
                      <span aria-hidden className="text-sm text-emerald-600">
                        ✓
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-1 border-t border-neutral-200 pt-1.5 dark:border-neutral-800">
              {creating ? (
                <form action={createList} className="flex flex-col gap-1.5 p-1">
                  <input type="hidden" name="household_id" value={householdId} />
                  <input
                    name="name"
                    required
                    autoFocus
                    maxLength={80}
                    placeholder="List name"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <input
                    name="store_name"
                    maxLength={80}
                    placeholder="Store name (optional)"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white active:bg-emerald-700"
                  >
                    Add list
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-base text-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-800"
                >
                  <span aria-hidden>＋</span> New list
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
