"use client";

import { useSyncExternalStore } from "react";
import { localDate } from "@/lib/recurrence";

// Re-render when the local date may have changed: at local midnight, and when
// the app comes back to the foreground (a phone tab can sleep across midnight,
// which a timer alone would miss).
function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  function scheduleMidnight() {
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );
    timer = setTimeout(() => {
      onChange();
      scheduleMidnight();
    }, midnight.getTime() - now.getTime() + 1000);
  }
  scheduleMidnight();
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/**
 * The viewer's local date as "YYYY-MM-DD". Null during server rendering and
 * hydration, since the server can't know the viewer's timezone: anything that
 * depends on "today" (overdue labels, next dates, rollover) waits for it.
 */
export function useLocalToday(): string | null {
  return useSyncExternalStore(subscribe, () => localDate(), () => null);
}
