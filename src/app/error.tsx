"use client";

import { useEffect } from "react";
import Link from "next/link";

// Catch-all boundary for the route. A thrown server action (e.g. a failed
// createList insert) or render error lands here with a recoverable retry,
// instead of crashing to a blank screen.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <div className="panel panel-stamp w-full max-w-sm">
        <div className="panel-head">
          <span>[ERROR]</span>
          <span>500</span>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <p className="t-body">
            {"// "}something broke while loading this list.
          </p>
          <p className="t-small text-[var(--fg-2)]">
            Your data is safe — try again, and if it keeps happening reload the
            page.
          </p>
          <div className="flex gap-2">
            <button onClick={reset} className="btn btn-sm btn-acid flex-1">
              [TRY AGAIN]
            </button>
            <Link href="/" className="btn btn-sm flex-1 no-underline">
              [HOME]
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
