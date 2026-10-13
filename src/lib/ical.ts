// iCalendar (RFC 5545) output for to-do due dates: the subscribed feed
// (/api/calendar/<token>.ics) and the one-task "Add to calendar" download.
// Plain strings only, so it runs on the server and in the browser alike.
//
// Due dates have no time of day, so every task is an all-day event
// (DTSTART;VALUE=DATE), which also keeps time zones out of the file.

import { addDays, isRecurring, type DueFields } from "@/lib/recurrence";

export type CalendarTask = DueFields & {
  id: string;
  name: string;
  notes?: string | null;
  list_name?: string | null;
  household_name?: string | null;
  checked_at?: string | null;
  // Shown as progress in the title and a checklist in the notes.
  subtasks?: { name: string; checked: boolean }[];
};

// Lime from the app's palette (--lime-deep, which holds up as text on white).
// Apple Calendar applies it when the calendar is first subscribed.
const CALENDAR_COLOR = "#B8C920";

// TEXT values escape backslash, semicolon, comma and newlines.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Content lines are folded at 75 octets: CRLF plus one space, never inside a
// multi-byte character.
const encoder = new TextEncoder();
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const ymd = (date: string) => date.replaceAll("-", "");

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function plural(n: number, unit: string) {
  return n === 1 ? unit : `${n} ${unit}s`;
}

// "Repeats every 2 weeks" / "Repeats 5 days after it's done".
function repeatText(task: CalendarTask): string | null {
  if (!isRecurring(task)) return null;
  const every = plural(task.repeat_every, task.repeat_unit);
  return task.repeat_from === "schedule"
    ? `Repeats every ${every}`
    : `Repeats ${task.repeat_every === 1 ? `a ${task.repeat_unit}` : every} after it's done`;
}

// "☐ Paint the hall · 2/5": a checkbox marks it as a task among real events.
function summary(task: CalendarTask, subtasks: CalendarTask["subtasks"]) {
  const done = subtasks?.filter((s) => s.checked).length ?? 0;
  const progress = subtasks?.length ? ` · ${done}/${subtasks.length}` : "";
  return `☐ ${task.name}${progress}`;
}

// The notes field, in blocks: where it lives and how it repeats, the task's
// own notes, its subtasks as a checklist, and a link back to the app (Google
// shows no URL field, so the link goes in the text too).
function description(
  task: CalendarTask,
  subtasks: CalendarTask["subtasks"],
  appUrl?: string
): string {
  const where = [task.list_name, task.household_name].filter(Boolean).join(" · ");
  const blocks = [
    [where, repeatText(task)].filter(Boolean).join("\n"),
    task.notes?.trim() ?? "",
    subtasks?.length
      ? subtasks.map((s) => `${s.checked ? "☑" : "☐"} ${s.name}`).join("\n")
      : "",
    appUrl ? `Open in Listser: ${appUrl}` : "",
  ];
  return blocks.filter(Boolean).join("\n\n");
}

// One VEVENT for a task due on `due`. Schedule-based repeats become an RRULE;
// a repeat counted from completion can't be expressed in iCalendar, so it is
// a single event on the next date, which moves when the task is checked off.
function event(
  task: CalendarTask,
  due: string,
  now: Date,
  appUrl?: string
): string[] {
  // A checked recurring task is shown at its next date, when it and its
  // subtasks come back unchecked.
  const subtasks = task.checked_at
    ? task.subtasks?.map((s) => ({ ...s, checked: false }))
      : task.subtasks;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${task.id}@listser`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${ymd(due)}`,
    `DTEND;VALUE=DATE:${ymd(addDays(due, 1))}`,
    `SUMMARY:${escapeText(summary(task, subtasks))}`,
    "TRANSP:TRANSPARENT",
  ];
  if (task.list_name) lines.push(`CATEGORIES:${escapeText(task.list_name)}`);
  if (isRecurring(task) && task.repeat_from === "schedule") {
    const freq = task.repeat_unit === "week" ? "WEEKLY" : "DAILY";
    lines.push(`RRULE:FREQ=${freq};INTERVAL=${task.repeat_every}`);
  }
  const notes = description(task, subtasks, appUrl);
  if (notes) lines.push(`DESCRIPTION:${escapeText(notes)}`);
  if (appUrl) lines.push(`URL:${appUrl}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar({
  name,
  description,
  events,
  now = new Date(),
}: {
  name: string;
  description?: string;
  events: { task: CalendarTask; due: string; appUrl?: string }[];
  now?: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Listser//Listser//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(name)}`,
    `X-WR-CALNAME:${escapeText(name)}`,
    ...(description
      ? [
          `DESCRIPTION:${escapeText(description)}`,
          `X-WR-CALDESC:${escapeText(description)}`,
        ]
      : []),
    `X-APPLE-CALENDAR-COLOR:${CALENDAR_COLOR}`,
    // Hints for how often subscribers re-fetch; Google ignores them.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap((e) => event(e.task, e.due, now, e.appUrl)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// A file name for a one-task download: "water-the-plants.ics".
export function icsFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60);
  return `${slug || "task"}.ics`;
}
