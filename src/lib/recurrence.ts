// Due dates + recurring to-do tasks (0011).
//
// Dates are plain "YYYY-MM-DD" strings in the viewer's local calendar, so the
// math below works on day numbers (never on Date objects in local time, which
// would drift across DST changes).
//
// A recurring task is never "advanced" when it is checked off. Checking stays
// the ordinary checked_at write, and the next occurrence is derived from the
// due date plus when it was checked. That keeps an accidental check undoable
// (uncheck, and the due date is untouched). The only writes this module plans
// are the rollover in planRollover: reopening tasks whose next date has
// arrived, and silently moving missed schedule-based tasks forward.

export type RepeatUnit = "day" | "week";
export type RepeatFrom = "schedule" | "completion";

export type DueFields = {
  due_on: string | null;
  repeat_every: number | null;
  repeat_unit: RepeatUnit | null;
  repeat_from: RepeatFrom | null;
};

type RecurringItem = DueFields & {
  id: string;
  checked_at: string | null;
  parent_item_id: string | null;
};

export type ItemPatch = {
  id: string;
  patch: {
    due_on?: string;
    checked_at?: null;
    checked_by?: null;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

// The calendar date of a Date in the runtime's local timezone.
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isRecurring<T extends DueFields>(
  item: T
): item is T & {
  due_on: string;
  repeat_every: number;
  repeat_unit: RepeatUnit;
  repeat_from: RepeatFrom;
} {
  return (
    item.due_on != null &&
    item.repeat_every != null &&
    item.repeat_unit != null &&
    item.repeat_from != null
  );
}

function stepDays(item: { repeat_every: number; repeat_unit: RepeatUnit }) {
  return item.repeat_every * (item.repeat_unit === "week" ? 7 : 1);
}

// Latest occurrence (due, due+step, due+2·step, …) on or before `today`, or
// `due` itself when it is still in the future. This is "skip silently": a
// missed occurrence is forgotten once the next one arrives.
function catchUp(due: string, step: number, today: string): string {
  const behind = toDayNumber(today) - toDayNumber(due);
  if (behind < step) return due;
  return addDays(due, Math.floor(behind / step) * step);
}

// When a checked recurring task comes back.
// - completion: `every` days/weeks after the day it was checked.
// - schedule: the first occurrence after both its due date and the day it was
//   checked, so an early check skips nothing and a late one doesn't bring the
//   task straight back.
export function nextDue(
  item: DueFields & { checked_at: string | null }
): string | null {
  if (!isRecurring(item) || !item.checked_at) return null;
  const step = stepDays(item);
  const checkedDay = localDate(new Date(item.checked_at));
  if (item.repeat_from === "completion") return addDays(checkedDay, step);

  const base = checkedDay > item.due_on ? checkedDay : item.due_on;
  const k = Math.floor((toDayNumber(base) - toDayNumber(item.due_on)) / step) + 1;
  return addDays(item.due_on, k * step);
}

// The writes that bring a list's recurring tasks up to `today`:
// - a checked task whose next date has arrived reopens on that date, and its
//   subtasks uncheck with it;
// - an unchecked schedule-based task skips any occurrence that has passed.
// An unchecked completion-based task has no next date until it is done, so it
// just stays overdue.
export function planRollover(
  items: RecurringItem[],
  today: string
): ItemPatch[] {
  const updates: ItemPatch[] = [];
  for (const item of items) {
    if (item.parent_item_id != null || !isRecurring(item)) continue;
    const step = stepDays(item);

    if (item.checked_at) {
      const next = nextDue(item);
      if (next == null || next > today) continue;
      updates.push({
        id: item.id,
        patch: {
          due_on:
            item.repeat_from === "schedule" ? catchUp(next, step, today) : next,
          checked_at: null,
          checked_by: null,
        },
      });
      for (const child of items) {
        if (child.parent_item_id === item.id && child.checked_at) {
          updates.push({
            id: child.id,
            patch: { checked_at: null, checked_by: null },
          });
        }
      }
    } else if (item.repeat_from === "schedule") {
      const due = catchUp(item.due_on, step, today);
      if (due !== item.due_on) updates.push({ id: item.id, patch: { due_on: due } });
    }
  }
  return updates;
}

// "26.10.12", matching the logbook-style stamp() on item rows.
export function shortDate(date: string): string {
  return date.slice(2).replaceAll("-", ".");
}

// Row label for an unchecked task's due date. `today` is null until the client
// knows its local date, so the label stays absolute (and hydration-safe).
export function dueLabel(
  due: string,
  today: string | null
): { text: string; tone: "overdue" | "today" | "soon" | "later" } {
  if (today != null) {
    if (due < today) return { text: `OVERDUE ${shortDate(due)}`, tone: "overdue" };
    if (due === today) return { text: "DUE TODAY", tone: "today" };
    if (due === addDays(today, 1)) return { text: "DUE TMRW", tone: "soon" };
  }
  return { text: `DUE ${shortDate(due)}`, tone: "later" };
}

// "↻ 2W" / "↻ 5D AFTER": every 5 days after it was last done.
export function repeatLabel(item: DueFields): string | null {
  if (!isRecurring(item)) return null;
  const unit = item.repeat_unit === "week" ? "W" : "D";
  const after = item.repeat_from === "completion" ? " AFTER" : "";
  return `↻ ${item.repeat_every}${unit}${after}`;
}
