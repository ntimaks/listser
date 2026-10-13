"use client";

import { useEffect } from "react";

// Registers public/sw.js, which opens the app offline and instantly from the
// home screen. Production only: in dev it would serve stale builds.
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Hand over what this page loaded before the worker ran.
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => new URL(u).pathname.startsWith("/_next/static/"));
        reg.active?.postMessage({
          type: "warm",
          urls: [...urls, location.pathname],
        });
      })
      .catch((e) => console.error("Service worker:", e));
  }, []);
  return null;
}
