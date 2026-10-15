"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MemberAvatar from "@/components/MemberAvatar";
import { createClient } from "@/lib/supabase/client";
import {
  AVATAR_COLORS,
  SWATCHES,
  autoAvatarColor,
  type AvatarColor,
} from "@/lib/members";
import { detectTimeZone } from "@/lib/reminders";

// Pick the color behind your initials. Saves on tap; AUTO goes back to the
// color picked from your user id. Everyone in the household sees the choice.
export default function AvatarColorPicker({
  userId,
  email,
  initial,
}: {
  userId: string;
  email: string;
  initial: AvatarColor | null;
}) {
  const router = useRouter();
  const [color, setColor] = useState<AvatarColor | null>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  async function choose(next: AvatarColor | null) {
    if (next === color || status === "saving") return;
    const prev = color;
    setColor(next);
    setStatus("saving");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_settings")
      .update({ avatar_color: next })
      .eq("user_id", userId)
      .select("user_id");
    // No settings row yet: create one, with the browser's timezone so the
    // reminder defaults stay right.
    const { error: insertError } =
      !error && data?.length === 0
        ? await supabase.from("user_settings").insert({
            user_id: userId,
            timezone: detectTimeZone(),
            avatar_color: next,
          })
        : { error: null };
    if (error || insertError) {
      setColor(prev);
      setStatus("error");
      return;
    }
    setStatus("idle");
    router.refresh();
  }

  const swatchButton = (value: AvatarColor | null) => {
    const shown = value ?? autoAvatarColor(userId);
    const selected = color === value;
    const label = value ? SWATCHES[value].label : "Auto";
    return (
      <button
        key={value ?? "auto"}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={label}
        title={label}
        onClick={() => choose(value)}
        className={`flex h-11 min-w-11 items-center justify-center border ${
          selected
            ? "border-[var(--ink-0)] outline outline-2 outline-offset-1 outline-[var(--ink-0)]"
            : "border-transparent"
        }`}
      >
        {value ? (
          <span
            aria-hidden
            className="block h-7 w-7 border border-[var(--ink-0)]"
            style={{ background: SWATCHES[shown].bg }}
          />
        ) : (
          <span
            aria-hidden
            className="flex h-7 items-center border border-[var(--ink-0)] px-1.5 text-[10px] font-bold tracking-[0.12em]"
          >
            AUTO
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <MemberAvatar userId={userId} email={email} color={color} size={44} />
        <span className="t-small min-w-0 text-[var(--fg-2)]">
          {color ? SWATCHES[color].label : "Auto"}
          {" // "}shown to your household
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label="Profile color"
        className="flex flex-wrap gap-1"
      >
        {swatchButton(null)}
        {AVATAR_COLORS.map(swatchButton)}
      </div>
      {status === "error" && (
        <p className="t-meta text-[var(--term-red)]">
          {"// "}couldn&rsquo;t save. try again.
        </p>
      )}
    </div>
  );
}
