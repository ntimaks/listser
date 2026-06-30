"use client";

import { useState } from "react";
import ItemRow from "@/components/ItemRow";
import Pixl from "@/components/Pixl";
import type { Item, ItemExtras } from "@/lib/useListItems";
import type { ListType } from "@/lib/listTypes";

// One to-do task plus its subtasks. Holds the parent/subtask invariant — a
// parent is checked iff it has subtasks and all of them are checked — and the
// dopamine: a progress bar/counter on the parent row (rendered by ItemRow) and
// the Pixl mascot leaping the moment the last subtask lands.
//
// The celebration is owned by SimpleList (via `celebrate` + `onCelebrate`), not
// local state: completing the last subtask auto-checks the parent, which moves
// it to the DONE section and remounts this component — local state wouldn't
// survive that, so we fire `onCelebrate` imperatively at the completing toggle.
export default function SubtaskGroup({
  parent,
  subtasks,
  type,
  addItem,
  setChecked,
  onDelete,
  onOpen,
  celebrate = false,
  onCelebrate,
  showAdd = true,
}: {
  parent: Item;
  subtasks: Item[];
  type: ListType;
  addItem: (name: string, extras?: ItemExtras) => Promise<void> | void;
  setChecked: (updates: { id: string; checked: boolean }[]) => void;
  onDelete: (item: Item) => void;
  onOpen: (item: Item) => void;
  celebrate?: boolean;
  onCelebrate?: (parentId: string) => void;
  showAdd?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const total = subtasks.length;
  const done = subtasks.filter((s) => s.checked_at).length;
  const parentChecked = Boolean(parent.checked_at);

  // Tapping the parent toggles all its subtasks to match (or just itself when
  // it has none) so the invariant always holds.
  function toggleParent() {
    const target = !parentChecked;
    if (total === 0) {
      setChecked([{ id: parent.id, checked: target }]);
      return;
    }
    setChecked([
      { id: parent.id, checked: target },
      ...subtasks.map((s) => ({ id: s.id, checked: target })),
    ]);
    if (target) onCelebrate?.(parent.id);
  }

  // Toggling a subtask may auto-complete (or reopen) the parent.
  function toggleSubtask(sub: Item) {
    const target = !sub.checked_at;
    const willAllBeChecked = subtasks.every((s) =>
      s.id === sub.id ? target : Boolean(s.checked_at)
    );
    const updates = [{ id: sub.id, checked: target }];
    if (parentChecked !== willAllBeChecked) {
      updates.push({ id: parent.id, checked: willAllBeChecked });
    }
    setChecked(updates);
    if (willAllBeChecked) onCelebrate?.(parent.id);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    await addItem(name, { parent_item_id: parent.id });
    // A fresh subtask is unfinished work, so a completed parent reopens.
    if (parentChecked) setChecked([{ id: parent.id, checked: false }]);
  }

  return (
    <li className="task-group relative">
      <ul className="flex flex-col">
        <ItemRow
          item={parent}
          type={type}
          onToggle={toggleParent}
          onDelete={onDelete}
          onOpen={onOpen}
          progress={total > 0 ? { done, total } : undefined}
        />
        {subtasks.map((s) => (
          <ItemRow
            key={s.id}
            item={s}
            type={type}
            isSubtask
            onToggle={toggleSubtask}
            onDelete={onDelete}
          />
        ))}
        {showAdd && (
          <li className="subtask-row">
            <form
              onSubmit={handleAdd}
              className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-1"
            >
              <span aria-hidden className="text-[var(--fg-disabled)]">
                +
              </span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="subtask"
                enterKeyHint="done"
                autoComplete="off"
                autoCapitalize="sentences"
                aria-label={`Add a subtask to ${parent.name}`}
                className="subtask-input min-w-0 flex-1"
              />
            </form>
          </li>
        )}
      </ul>

      {celebrate && (
        <span className="celebrate t-pixel" aria-hidden>
          <Pixl motion="jump" size={18} />
          nice
        </span>
      )}
    </li>
  );
}
