"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Uppercase title shown in the head bar. */
  title: string;
  /** Optional [BRACKETED] stamp on the right of the head, matching card heads. */
  code?: string;
  /** Pinned action bar (e.g. Save) below the scrollable body, flush with the
   *  sheet's bottom edge. */
  footer?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Bottom-sheet drawer in the NIKOLASS system: 1px ink border, square corners,
 * paper surface, offset stamp shadow (no blur), uppercase tracked head bar,
 * over a terminal-style scanline backdrop.
 * Closes on backdrop click and Escape; locks body scroll while open.
 */
export default function Drawer({
  open,
  onClose,
  title,
  code,
  footer,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      // A picker inside the drawer marks its own Escape as handled.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
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
        className="drawer-backdrop fixed inset-0 z-40"
        aria-hidden
        onClick={onClose}
      >
        {/* Terminal status strip: what's open, and how to leave. */}
        <div className="drawer-strip">
          <span className="drawer-strip-cmd">
            &gt;&nbsp;
            <span
              className="drawer-type"
              style={{ "--chars": title.length } as React.CSSProperties}
            >
              {title}
            </span>
            <span className="drawer-cursor">█</span>
          </span>
          <span className="drawer-strip-dim">[ESC]</span>
        </div>
      </div>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="drawer-sheet panel panel-stamp fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[88dvh] max-w-md flex-col"
      >
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
        {/* Scrollable body so tall content never overflows the viewport. With
            no footer it carries the home-indicator safe-area padding itself. */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-[var(--s-4)] pt-[var(--s-4)]"
          style={{
            paddingBottom: footer
              ? "var(--s-4)"
              : "max(var(--s-6), env(safe-area-inset-bottom))",
          }}
        >
          {children}
        </div>
        {/* Outside the scroller, so no padding gap and nothing scrolls under it. */}
        {footer && (
          <div
            className="flex-none border-t border-[var(--ink-0)] bg-[var(--bg-panel)] px-[var(--s-4)] pt-3"
            style={{
              paddingBottom: "max(var(--s-4), env(safe-area-inset-bottom))",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
