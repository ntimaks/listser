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
};

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

// One VEVENT for a task due on `due`. Schedule-based repeats become an RRULE;
// a repeat counted from completion can't be expressed in iCalendar, so it is
// a single event on the next date, which moves when the task is checked off.
function event(
  task: CalendarTask,
  due: string,
  now: Date,
  appUrl?: string
): string[] {
  const description = [
    [task.household_name, task.list_name].filter(Boolean).join(" · "),
    task.notes ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const lines = [
    "BEGIN:VEVENT",
    `UID:${task.id}@listser`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${ymd(due)}`,
    `DTEND;VALUE=DATE:${ymd(addDays(due, 1))}`,
    `SUMMARY:${escapeText(task.name)}`,
    "TRANSP:TRANSPARENT",
  ];
  if (isRecurring(task) && task.repeat_from === "schedule") {
    const freq = task.repeat_unit === "week" ? "WEEKLY" : "DAILY";
    lines.push(`RRULE:FREQ=${freq};INTERVAL=${task.repeat_every}`);
  }
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (appUrl) lines.push(`URL:${appUrl}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar({
  name,
  events,
  now = new Date(),
}: {
  name: string;
  events: { task: CalendarTask; due: string; appUrl?: string }[];
  now?: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Listser//Listser//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
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
