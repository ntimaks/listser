// Reminder emails (0016): which tasks are due for a recipient right now, and
// the email for one of them. Plain functions, no I/O, so the send route stays
// a thin loop and this can be checked on its own.

import type { CalendarTask } from "@/lib/ical";
import { localDate, upcomingDue } from "@/lib/recurrence";

export type ReminderTask = CalendarTask & {
  checked_at: string | null;
  list_id: string;
};

// One row of the reminder_candidates RPC.
export type ReminderRecipient = {
  user_id: string;
  email: string;
  timezone: string;
  send_time: string; // "HH:MM"
  unsubscribe_token: string;
  items: ReminderTask[];
};

// "HH:MM" of `now` in `timeZone`.
function localTime(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("hour")}:${get("minute")}`;
}

// The recipient's tasks that are due today in their timezone, once their send
// time has passed. Uses upcomingDue, so a checked repeating task whose next
// date is today counts even if no one has opened the app to reopen it.
export function dueNow(
  recipient: ReminderRecipient,
  now: Date
): { task: ReminderTask; due: string }[] {
  let today: string;
  let time: string;
  try {
    today = localDate(now, recipient.timezone);
    time = localTime(now, recipient.timezone);
  } catch {
    // A zone the runtime doesn't know (the database validated it, so this is
    // only a stale ICU): fall back to UTC rather than skip the person.
    today = localDate(now, "UTC");
    time = localTime(now, "UTC");
  }
  if (time < recipient.send_time) return [];

  return recipient.items.flatMap((task) =>
    upcomingDue(task, today, recipient.timezone) === today
      ? [{ task, due: today }]
      : []
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ReminderEmail = {
  subject: string;
  text: string;
  html: string;
};

export function reminderEmail(
  task: ReminderTask,
  links: { app: string; unsubscribe: string; settings: string }
): ReminderEmail {
  const where = [task.household_name, task.list_name].filter(Boolean).join(" · ");
  const notes = task.notes?.trim();

  const text = [
    `Due today: ${task.name}`,
    where && `In ${where}`,
    notes && `\n${notes}`,
    `\nOpen in Listser: ${links.app}`,
    `\n--\nYou get this because the task lists you to remind.`,
    `Change your send time: ${links.settings}`,
    `Stop reminder emails: ${links.unsubscribe}`,
  ]
    .filter(Boolean)
    .join("\n");

  const muted = "color:#6b6b6b;font-size:13px;line-height:1.5";
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#ffffff;color:#111111;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">
<p style="margin:0 0 4px;${muted};letter-spacing:.08em">DUE TODAY</p>
<p style="margin:0 0 4px;font-size:20px;font-weight:700;line-height:1.3">${escapeHtml(task.name)}</p>
${where ? `<p style="margin:0 0 16px;${muted}">${escapeHtml(where)}</p>` : ""}
${notes ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapeHtml(notes)}</p>` : ""}
<p style="margin:0 0 32px"><a href="${escapeHtml(links.app)}" style="display:inline-block;padding:10px 16px;background:#111111;color:#ffffff;text-decoration:none;font-weight:700">Open in Listser</a></p>
<p style="margin:0;${muted}">You get this because the task lists you to remind.
<a href="${escapeHtml(links.settings)}" style="color:#6b6b6b">Change send time</a> ·
<a href="${escapeHtml(links.unsubscribe)}" style="color:#6b6b6b">Stop reminder emails</a></p>
</body></html>`;

  // A header can't hold line breaks.
  const subject = `Due today: ${task.name.replace(/\s+/g, " ").trim()}`;
  return { subject, text, html };
}
