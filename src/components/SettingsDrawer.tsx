"use client";

import { useEffect, useMemo, useState } from "react";
import Drawer from "@/components/Drawer";
import Hint from "@/components/Hint";
import Segmented from "@/components/Segmented";
import Select from "@/components/Select";
import { createClient } from "@/lib/supabase/client";
import {
  SEND_TIME_OPTIONS,
  detectTimeZone,
  timeZoneSelectOptions,
  toSendTime,
  type ReminderSettings,
} from "@/lib/reminders";

// The signed-in user's own reminder preferences. Loads on open; until a row
// exists the form shows the defaults with the browser's timezone.
export default function SettingsDrawer({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from("user_settings")
        .select("reminders_enabled, send_time, timezone")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setSettings({
        reminders_enabled: data?.reminders_enabled ?? true,
        send_time: toSendTime(data?.send_time),
        timezone: data?.timezone ?? detectTimeZone(),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handleSave() {
    if (!settings) return;
    setStatus("saving");
    const { error } = await createClient()
      .from("user_settings")
      .upsert({ user_id: userId, ...settings }, { onConflict: "user_id" });
    if (error) {
      setStatus("error");
      return;
    }
    onClose();
  }

  // Every IANA zone with its offset and local time. Rebuilt only when the
  // saved zone changes (it is always listed, even if the browser lacks it).
  const zone = settings?.timezone;
  const zoneOptions = useMemo(
    () => (zone ? timeZoneSelectOptions(zone) : []),
    [zone]
  );

  const update = (patch: Partial<ReminderSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s));

  return (
    <Drawer open onClose={onClose} title="Reminders" code="[REM]">
      {!settings ? (
        <p className="t-meta py-6 text-center text-[var(--fg-muted)]">
          loading…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <Segmented
            label="Email reminders"
            value={settings.reminders_enabled ? "on" : "off"}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
            onChange={(v) => update({ reminders_enabled: v === "on" })}
          />

          <Select
            label="Send time"
            value={settings.send_time}
            options={SEND_TIME_OPTIONS}
            onChange={(send_time) => update({ send_time })}
            disabled={!settings.reminders_enabled}
            searchPlaceholder="Search, e.g. 08 or pm"
          />

          <Select
            label="Timezone"
            value={settings.timezone}
            options={zoneOptions}
            onChange={(timezone) => update({ timezone })}
            disabled={!settings.reminders_enabled}
            searchPlaceholder="Search city or offset, e.g. Riga or +3"
          />

          <Hint motion="idle">
            {settings.reminders_enabled
              ? "one email per task on its due date, for tasks that list you to remind"
              : "no reminder emails. tasks still keep you as a recipient"}
          </Hint>

          {status === "error" && (
            <p className="t-meta text-[var(--term-red)]">
              {"// "}couldn&rsquo;t save. try again.
            </p>
          )}

          <div className="sticky bottom-0 -mx-[var(--s-4)] border-t border-[var(--ink-0)] bg-[var(--bg-panel)] px-[var(--s-4)] pb-1 pt-3">
            <button
              onClick={handleSave}
              disabled={status === "saving"}
              className="btn btn-acid w-full"
            >
              {status === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
