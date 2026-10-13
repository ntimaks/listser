"use client";

import { useOutboxStatus } from "@/lib/outbox";

// One quiet line under the header while changes wait to reach the server.
export default function SyncStatus() {
  const { pending, offline } = useOutboxStatus();
  if (pending === 0 || !offline) return null;
  return (
    <p className="t-meta mt-2 text-[var(--fg-muted)]" role="status">
      {"// "}offline · {pending} {pending === 1 ? "change" : "changes"} saved on
      this phone, sending when back online.
    </p>
  );
}
