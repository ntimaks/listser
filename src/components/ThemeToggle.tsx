"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  readThemePref,
  saveThemePref,
  type ThemePref,
} from "@/lib/theme";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "AUTO" },
  { value: "light", label: "LIGHT" },
  { value: "dark", label: "DARK" },
];

// Segmented AUTO / LIGHT / DARK picker. The choice is stored per device.
export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    // Sync with what the inline head script already applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref(readThemePref());
  }, []);

  function choose(next: ThemePref) {
    setPref(next);
    saveThemePref(next);
    applyTheme(next);
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          onClick={() => choose(o.value)}
          className={`btn flex-1 ${pref === o.value ? "btn-acid" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
