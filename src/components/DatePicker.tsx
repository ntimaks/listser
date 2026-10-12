"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { addDays, localDate } from "@/lib/recurrence";
import { useLocalToday } from "@/lib/useLocalToday";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Day math on "YYYY-MM-DD" strings via UTC, like src/lib/recurrence.ts, so a
// DST change never shifts a day.
function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}
function weekday(date: string) {
  const { y, m, d } = parts(date);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = Monday
}
function daysBetween(from: string, to: string) {
  const a = parts(from);
  const b = parts(to);
  return Math.round(
    (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000
  );
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
// The month's days with leading blanks so the 1st lands under its weekday.
function monthCells(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const blanks: null[] = Array(weekday(first)).fill(null);
  return [...blanks, ...Array.from({ length: len }, (_, i) => addDays(first, i))];
}
function longDate(date: string) {
  const { y, m, d } = parts(date);
  return `${WEEKDAYS[weekday(date)]} ${d} ${MONTHS[m - 1]} ${y}`;
}
function relative(date: string, today: string) {
  const n = daysBetween(today, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/**
 * Due-date picker in the terminal style of the drawer backdrop: a .field-like
 * trigger that opens a CRT month in place. Today sits in [brackets], the pick
 * goes inverse. Focused, it is keyboard-driven: arrows move the cursor, PgUp /
 * PgDn change month, Enter picks, T today, N next week, X clears, Esc closes.
 * `value` is "YYYY-MM-DD", or "" for no date.
 */
export default function DatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const today = useLocalToday() ?? localDate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (value || today).slice(0, 7));
  const [cursor, setCursor] = useState(value || today);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  function openCal() {
    const start = value || today;
    setView(start.slice(0, 7));
    setCursor(start);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function pick(v: string) {
    onChange(v);
    close();
  }
  function moveTo(v: string) {
    setCursor(v);
    setView(v.slice(0, 7));
  }

  useLayoutEffect(() => {
    if (!open) return;
    screenRef.current?.focus({ preventScroll: true });
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  // A tap anywhere else closes the calendar.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      // preventDefault tells the Drawer this Escape is already handled.
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.target !== screenRef.current) return;
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const key = e.key.toLowerCase();
    if (move != null) {
      e.preventDefault();
      moveTo(addDays(cursor, move));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const ym = shiftMonth(cursor.slice(0, 7), e.key === "PageUp" ? -1 : 1);
      const { d } = parts(cursor);
      const len = monthCells(ym).filter(Boolean).length;
      moveTo(`${ym}-${String(Math.min(d, len)).padStart(2, "0")}`);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(cursor);
    } else if (key === "t") pick(today);
    else if (key === "n") pick(addDays(today, 7));
    else if (key === "x") pick("");
  }

  const [vy, vm] = view.split("-").map(Number);

  return (
    <div ref={rootRef} className="flex flex-col gap-1" onKeyDown={onKeyDown}>
      <span id={`${id}-label`} className="t-meta">
        {label}
      </span>
      <div className="flex gap-2">
        <button
          ref={triggerRef}
          type="button"
          className="select-trigger min-w-0 flex-1"
          aria-expanded={open}
          aria-labelledby={`${id}-label ${id}-value`}
          onClick={() => (open ? close() : openCal())}
        >
          <span
            id={`${id}-value`}
            className={`select-value${value ? "" : " is-empty"}`}
          >
            {value ? longDate(value) : "No due date"}
          </span>
          {value && <span className="select-meta">{relative(value, today)}</span>}
          <span className="select-caret" aria-hidden>
            {open ? "▴" : "▾"}
          </span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="btn btn-sm btn-ghost shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div
          ref={screenRef}
          className="tcal"
          tabIndex={0}
          role="group"
          aria-label={`${label}. Arrow keys move, Enter picks, Escape closes.`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // Clicking a day or arrow keeps focus on the screen, so the keys
          // keep working after a month change.
          onMouseDown={(e) => {
            if (e.target !== screenRef.current) e.preventDefault();
          }}
        >
          <div className="tcal-bar">
            <span>&gt; cal --due</span>
            <span className="tcal-dim" aria-hidden>
              [←↑↓→ ⏎]
            </span>
          </div>
          <div className="tcal-month">
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setView(shiftMonth(view, -1))}
              aria-label="Previous month"
            >
              &lt;&lt;
            </button>
            <span aria-live="polite">
              {MONTHS[vm - 1].toUpperCase()} {vy}
            </span>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setView(shiftMonth(view, 1))}
              aria-label="Next month"
            >
              &gt;&gt;
            </button>
          </div>
          <div className="tcal-dow" aria-hidden>
            {WEEKDAYS.map((d) => (
              <span key={d}>{d.slice(0, 2).toUpperCase()}</span>
            ))}
          </div>
          <div className="tcal-grid">
            {monthCells(view).map((d, i) =>
              d == null ? (
                <span key={`blank-${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  tabIndex={-1}
                  onClick={() => pick(d)}
                  aria-label={longDate(d)}
                  aria-pressed={d === value}
                  aria-current={d === today ? "date" : undefined}
                  className={[
                    "tcal-day",
                    d < today && "is-past",
                    d === today && "is-today",
                    d === value && "is-selected",
                    focused && d === cursor && "is-cursor",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {d.slice(8)}
                </button>
              )
            )}
          </div>
          <div className="tcal-out" aria-hidden>
            &gt; due_on={cursor}{" "}
            <span className="tcal-dim"># {relative(cursor, today)}</span>
            <span className="tcal-cursor">█</span>
          </div>
          <span className="sr-only" aria-live="polite">
            {focused ? longDate(cursor) : ""}
          </span>
          <div className="tcal-keys">
            <button type="button" tabIndex={-1} onClick={() => pick(today)}>
              <b>[T]</b>oday
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => pick(addDays(today, 7))}
            >
              <b>[N]</b>ext wk
            </button>
            <button type="button" tabIndex={-1} onClick={() => pick("")}>
              <b>[X]</b> clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
