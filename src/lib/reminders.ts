// Reminder settings + recipients (0012). Sending happens server-side on a
// schedule; the app only stores each user's preferences and each task's
// recipients.

// avatar_color is null until the member picks one (and before 0018).
export type Member = {
  user_id: string;
  email: string;
  avatar_color?: string | null;
};

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

// Rows for the time zone Select: city under its region, with the zone's local
// time and UTC offset right now. Search also matches the full IANA name.
export function timeZoneSelectOptions(current: string, now = new Date()) {
  return timeZoneOptions(current).map((zone) => {
    const path = zone.split("/");
    let time = "";
    let offset = "UTC";
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZoneName: "shortOffset",
      }).formatToParts(now);
      const get = (type: string) => parts.find((p) => p.type === type)?.value;
      time = `${get("hour")}:${get("minute")}`;
      offset = (get("timeZoneName") ?? "GMT").replace("GMT", "UTC");
    } catch {
      // Unknown to this browser: still listed so the saved value shows.
    }
    return {
      value: zone,
      label: path[path.length - 1].replaceAll("_", " "),
      group: path.length > 1 ? path[0] : "Universal",
      hint: time,
      meta: offset,
      keywords: zone.replaceAll("_", " "),
    };
  });
}

function dayPart(time: string): string {
  const h = Number(time.slice(0, 2));
  if (h < 6) return "Early";
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  if (h < 22) return "Evening";
  return "Late";
}

// Rows for the send time Select, grouped by part of day with a 12-hour hint.
export const SEND_TIME_OPTIONS = SEND_TIMES.map((t) => {
  const h = Number(t.slice(0, 2));
  return {
    value: t,
    label: t,
    group: dayPart(t),
    hint: `${h % 12 || 12}:${t.slice(3)} ${h < 12 ? "am" : "pm"}`,
  };
});

// Postgres returns `time` as "HH:MM:SS".
export function toSendTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : DEFAULT_SEND_TIME;
}
