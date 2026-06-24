"use client";

import { useState } from "react";
import Link from "next/link";
import { createList } from "@/app/actions";
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

export default function ListSwitcher({
  lists,
  activeListId,
  activeListName,
  activeListStoreName,
  activeListType,
  householdId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<ListType>("grocery");

  function close() {
    setOpen(false);
    setCreating(false);
    setNewType("grocery");
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg py-0.5 text-xl font-bold leading-tight active:opacity-70"
      >
        <span>
          <span aria-hidden className="mr-1.5 text-base">
            {COPY[activeListType].icon}
          </span>
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
                      <span aria-hidden className="mr-2 text-sm">
                        {COPY[list.type].icon}
                      </span>
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
                  <input type="hidden" name="type" value={newType} />

                  <div className="flex gap-1">
                    {LIST_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewType(t)}
                        className={`flex-1 rounded-lg border px-1 py-1.5 text-xs font-medium ${
                          newType === t
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                            : "border-neutral-300 text-neutral-500 dark:border-neutral-700"
                        }`}
                      >
                        <span aria-hidden className="mr-0.5">
                          {COPY[t].icon}
                        </span>
                        {COPY[t].label}
                      </button>
                    ))}
                  </div>

                  <input
                    name="name"
                    required
                    autoFocus
                    maxLength={80}
                    placeholder="List name"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  {newType === "grocery" && (
                    <input
                      name="store_name"
                      maxLength={80}
                      placeholder="Store name (optional)"
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  )}
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
