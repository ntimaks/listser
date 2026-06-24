"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Uppercase title shown in the head bar. */
  title: string;
  /** Optional [BRACKETED] stamp on the right of the head, matching card heads. */
  code?: string;
  children: React.ReactNode;
};

/**
 * Bottom-sheet drawer in the NIKOLASS system: 1px ink border, square corners,
 * paper surface, offset stamp shadow (no blur), uppercase tracked head bar.
 * Closes on backdrop click and Escape; locks body scroll while open.
 */
export default function Drawer({ open, onClose, title, code, children }: Props) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="drawer-backdrop fixed inset-0 z-40 bg-[var(--ink-0)]/30"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="drawer-sheet panel panel-stamp fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[88dvh] max-w-md flex-col"
      >
        {/* Grab handle for affordance. */}
        <div className="flex flex-none justify-center pt-2" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-[var(--ink-5)]" />
        </div>
        <div className="panel-head flex-none">
          <span>{title}</span>
          <div className="flex items-center gap-2">
            {code && <span>{code}</span>}
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm btn-ghost"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        {/* Scrollable body so tall content never overflows the viewport, with
            safe-area padding for home-indicator phones. */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-[var(--s-4)] pt-[var(--s-4)]"
          style={{
            paddingBottom: "max(var(--s-6), env(safe-area-inset-bottom))",
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
