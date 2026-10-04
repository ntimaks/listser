// Reminder settings + recipients (0012). Sending happens server-side on a
// schedule; the app only stores each user's preferences and each task's
// recipients.

export type Member = { user_id: string; email: string };

export type ReminderSettings = {
  reminders_enabled: boolean;
  send_time: string; // "HH:MM"
  timezone: string; // IANA name
};

export const DEFAULT_SEND_TIME = "08:00";

// Send times in the 15-minute steps the database accepts.
export const SEND_TIMES = Array.from({ length: 96 }, (_, i) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(i / 4))}:${p((i % 4) * 15)}`;
});

export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Every IANA zone the browser knows, always including `current` (some browsers
// leave out "UTC", which is the database default).
export function timeZoneOptions(current: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(current) ? zones : [current, ...zones];
}

// Postgres returns `time` as "HH:MM:SS".
export function toSendTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : DEFAULT_SEND_TIME;
}
