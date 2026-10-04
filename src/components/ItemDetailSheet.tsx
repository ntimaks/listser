"use client";

import { useState } from "react";
import Drawer from "@/components/Drawer";
import Hint from "@/components/Hint";
import type { Item } from "@/lib/useListItems";
import { type ListType, COPY, LEVELS, attrLabels } from "@/lib/listTypes";
import type { RepeatFrom, RepeatUnit } from "@/lib/recurrence";

type ListSummary = { id: string; name: string; type: ListType };

// A 1–5 level picker styled in the terminal system. Tapping the active cell
// again clears it (back to unset).
function LevelPicker({
  label,
  value,
  onChange,
  variant,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  variant: "acid" | "cobalt";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="t-meta">{label}</span>
      <div className="flex gap-1">
        {LEVELS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`btn btn-sm flex-1 ${
              value === n ? (variant === "acid" ? "btn-acid" : "btn-cobalt") : ""
            }`}
            aria-pressed={value === n}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// A row of mutually exclusive options, styled like LevelPicker.
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="t-meta">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`btn btn-sm flex-1 ${value === o.value ? "btn-cobalt" : ""}`}
            aria-pressed={value === o.value}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Item editor built on the shared Drawer. Importance + Effort/Cost (1–5) apply
// to both todo and wishlist; wishlist additionally gets an exact € price and a
// link, todo a due date and repeat. Hosts the "Move to…" promotion picker.
export default function ItemDetailSheet({
  item,
  type,
  lists,
  currentListId,
  onClose,
  onSave,
  onDelete,
  onMove,
}: {
  item: Item;
  type: ListType;
  lists: ListSummary[];
  currentListId: string;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Item>) => void;
  onDelete: (item: Item) => void;
  onMove: (item: Item, targetListId: string) => void;
}) {
  const [name, setName] = useState(item.name);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [importance, setImportance] = useState<number | null>(item.importance);
  const [effort, setEffort] = useState<number | null>(item.effort);
  const [url, setUrl] = useState(item.url ?? "");
  const [priceInput, setPriceInput] = useState(
    item.price_cents != null ? (item.price_cents / 100).toFixed(2) : ""
  );
  const [showMove, setShowMove] = useState(false);
  const [dueOn, setDueOn] = useState(item.due_on ?? "");
  const [repeatOn, setRepeatOn] = useState(item.repeat_every != null);
  const [repeatEvery, setRepeatEvery] = useState(
    String(item.repeat_every ?? 1)
  );
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit>(
    item.repeat_unit ?? "week"
  );
  const [repeatFrom, setRepeatFrom] = useState<RepeatFrom>(
    item.repeat_from ?? "schedule"
  );

  const isWishlist = type === "wishlist";
  const isTodo = type === "todo";
  const every = Number(repeatEvery);
  const repeatInvalid =
    isTodo &&
    Boolean(dueOn) &&
    repeatOn &&
    !(Number.isInteger(every) && every >= 1 && every <= 365);
  const labels = attrLabels(type);
  const moveTargets = lists.filter((l) => l.id !== currentListId);

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName || repeatInvalid) return;

    const patch: Partial<Item> = {
      name: trimmedName,
      notes: notes.trim() || null,
      importance,
      effort,
      priority: null, // legacy field — superseded by importance
    };
    if (isTodo) {
      patch.due_on = dueOn || null;
      const repeats = Boolean(dueOn) && repeatOn;
      patch.repeat_every = repeats ? every : null;
      patch.repeat_unit = repeats ? repeatUnit : null;
      patch.repeat_from = repeats ? repeatFrom : null;
    }
    if (isWishlist) {
      patch.url = url.trim() || null;
      const parsed = parseFloat(priceInput.replace(",", "."));
      patch.price_cents =
        priceInput.trim() && !Number.isNaN(parsed)
          ? Math.round(parsed * 100)
          : null;
    }
    onSave(item.id, patch);
    onClose();
  }

  function handleDelete() {
    onDelete(item);
    onClose();
  }

  function handleMove(targetListId: string) {
    onMove(item, targetListId);
    onClose();
  }

  return (
    <Drawer open onClose={onClose} title="Edit" code="[ITM]">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="t-meta">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="field"
          />
        </label>

        <LevelPicker
          label={labels.importance}
          value={importance}
          onChange={setImportance}
          variant="acid"
        />
        <LevelPicker
          label={labels.effort}
          value={effort}
          onChange={setEffort}
          variant="cobalt"
        />
        <Hint motion="idle">
          importance + {labels.effort.toLowerCase()} set the quick-wins order ·
          tap a number again to clear
        </Hint>

        {isTodo && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="item-due-on" className="t-meta">
                Due date
              </label>
              <div className="flex gap-2">
                <input
                  id="item-due-on"
                  type="date"
                  value={dueOn}
                  onChange={(e) => setDueOn(e.target.value)}
                  className="field min-w-0 flex-1"
                />
                {dueOn && (
                  <button
                    type="button"
                    onClick={() => setDueOn("")}
                    className="btn btn-sm btn-ghost shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {dueOn && (
              <>
                <Segmented
                  label="Repeat"
                  value={repeatOn ? "on" : "off"}
                  options={[
                    { value: "off", label: "Once" },
                    { value: "on", label: "Repeat" },
                  ]}
                  onChange={(v) => setRepeatOn(v === "on")}
                />
                {repeatOn && (
                  <>
                    <div className="flex items-end gap-2">
                      <label className="flex w-20 flex-col gap-1">
                        <span className="t-meta">Every</span>
                        <input
                          value={repeatEvery}
                          onChange={(e) => setRepeatEvery(e.target.value)}
                          inputMode="numeric"
                          className="field"
                          aria-invalid={repeatInvalid}
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <Segmented
                          label="Unit"
                          value={repeatUnit}
                          options={[
                            { value: "day", label: "Days" },
                            { value: "week", label: "Weeks" },
                          ]}
                          onChange={setRepeatUnit}
                        />
                      </div>
                    </div>
                    <Segmented
                      label="Counted from"
                      value={repeatFrom}
                      options={[
                        { value: "schedule", label: "Due date" },
                        { value: "completion", label: "Last done" },
                      ]}
                      onChange={setRepeatFrom}
                    />
                    <Hint motion="idle">
                      {repeatFrom === "schedule"
                        ? "keeps to the schedule · a missed one is skipped when the next comes round"
                        : "next one is counted from the day you check it off"}
                    </Hint>
                  </>
                )}
              </>
            )}
          </>
        )}

        {isWishlist && (
          <>
            <label className="flex flex-col gap-1">
              <span className="t-meta">Exact price (€)</span>
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="field"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="t-meta">Link</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                inputMode="url"
                autoCapitalize="off"
                placeholder="https://…"
                className="field"
              />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="t-meta">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={2}
            className="field resize-none"
          />
        </label>

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="t-small text-center text-[var(--cobalt)]"
          >
            Open link ↗
          </a>
        )}

        <div className="flex flex-col gap-2 border-t border-[var(--ink-5)] pt-3">
          {moveTargets.length > 0 &&
            (showMove ? (
              <div className="flex flex-col gap-1">
                <span className="t-meta px-1 pb-1">Move to…</span>
                {moveTargets.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => handleMove(l.id)}
                    className="flex items-center gap-2 border-b border-[var(--ink-5)] px-2 py-2.5 text-left active:bg-[var(--paper-2)]"
                  >
                    <span className="t-stamp text-[var(--fg-muted)]">
                      {COPY[l.type].tag}
                    </span>
                    <span className="t-body truncate">{l.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setShowMove(true)}
                className="btn btn-sm btn-ghost w-full"
              >
                Move to another list
              </button>
            ))}

          <button
            onClick={handleDelete}
            className="btn btn-sm btn-ghost w-full active:text-[var(--term-red)]"
          >
            Delete item
          </button>
        </div>

        {/* Sticky footer so Save stays reachable above the keyboard. */}
        <div className="sticky bottom-0 -mx-[var(--s-4)] border-t border-[var(--ink-0)] bg-[var(--bg-panel)] px-[var(--s-4)] pb-1 pt-3">
          <button
            onClick={handleSave}
            disabled={!name.trim() || repeatInvalid}
            className="btn btn-acid w-full"
          >
            Save
          </button>
        </div>
      </div>
    </Drawer>
  );
}
