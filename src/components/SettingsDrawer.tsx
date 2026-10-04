"use client";

import { useEffect, useState } from "react";
import { signOut } from "@/app/actions";
import Drawer from "@/components/Drawer";
import Hint from "@/components/Hint";
import Segmented from "@/components/Segmented";
import { createClient } from "@/lib/supabase/client";
import {
  SEND_TIMES,
  detectTimeZone,
  timeZoneOptions,
  toSendTime,
  type ReminderSettings,
} from "@/lib/reminders";

// The signed-in user's own reminder preferences, plus sign-out. Loads on open;
// until a row exists the form shows the defaults with the browser's timezone.
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

  const update = (patch: Partial<ReminderSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s));

  return (
    <Drawer open onClose={onClose} title="Settings" code="[SET]">
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

          <label className="flex flex-col gap-1">
            <span className="t-meta">Send time</span>
            <select
              value={settings.send_time}
              onChange={(e) => update({ send_time: e.target.value })}
              disabled={!settings.reminders_enabled}
              className="field"
            >
              {SEND_TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-meta">Timezone</span>
            <select
              value={settings.timezone}
              onChange={(e) => update({ timezone: e.target.value })}
              disabled={!settings.reminders_enabled}
              className="field"
            >
              {timeZoneOptions(settings.timezone).map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <Hint motion="idle">
            {settings.reminders_enabled
              ? "one email per task on its due date, for tasks that list you to remind"
              : "no reminder emails. tasks still keep you as a recipient"}
          </Hint>

          <form
            action={signOut}
            className="border-t border-[var(--ink-5)] pt-3"
          >
            <button type="submit" className="btn btn-sm btn-ghost w-full">
              Sign out
            </button>
          </form>

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
