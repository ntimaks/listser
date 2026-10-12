"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  /** Section the option sits under. Consecutive options share one sticky head. */
  group?: string;
  /** Muted middle column, e.g. a zone's local time. */
  hint?: string;
  /** Right-aligned column, e.g. a UTC offset. */
  meta?: string;
  /** Extra text the search matches, e.g. the full IANA name. */
  keywords?: string;
};

function matches(o: SelectOption, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [o.label, o.value, o.group, o.hint, o.meta, o.keywords].some((s) =>
    s?.toLowerCase().includes(q)
  );
}

/**
 * Searchable dropdown in the NIKOLASS system, the "index card" style: a
 * .field-like trigger that opens a list in place (drawer bodies scroll, so a
 * floating popover would get clipped). Search line on top, sticky group heads,
 * hint/meta columns, the keyboard row filled lime. Arrows move, Enter picks,
 * Esc closes the list without closing the surrounding drawer.
 */
export default function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  searchPlaceholder = "Search",
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
  searchPlaceholder?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<T | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const shown = useMemo(
    () => options.filter((o) => matches(o, query)),
    [options, query]
  );
  // Option ids by position in the full list, since values (IANA names) hold "/".
  const indexOf = useMemo(
    () => new Map(options.map((o, i) => [o.value, i])),
    [options]
  );
  const optionId = (v: T) => `${id}-opt-${indexOf.get(v)}`;

  function openList() {
    setQuery("");
    setActive(value);
    setOpen(true);
  }
  function close(refocus = true) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }
  function pick(v: T) {
    onChange(v);
    close();
  }

  // On open: focus the search line, center the current pick, keep the panel
  // inside the scrolling drawer's view.
  useLayoutEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
    const list = listRef.current;
    const sel = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && sel) {
      list.scrollTop = sel.offsetTop - list.clientHeight / 2 + sel.offsetHeight / 2;
    }
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  // Keep the keyboard row visible below the sticky group head.
  useEffect(() => {
    if (!open || active == null) return;
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(".is-active");
    if (!list || !el) return;
    const head = 24;
    if (el.offsetTop - head < list.scrollTop) list.scrollTop = el.offsetTop - head;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
  }, [active, open]);

  // A tap anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      // preventDefault tells the Drawer this Escape is already handled.
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "Tab") {
      close(false);
      return;
    }
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[e.key];
    if (step != null && shown.length > 0) {
      e.preventDefault();
      const i = shown.findIndex((o) => o.value === active);
      const next = i < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, i + step));
      setActive(shown[next].value);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active != null && shown.some((o) => o.value === active)) pick(active);
    }
  }

  // Consecutive options with the same group render under one sticky head.
  const groups: { name?: string; items: SelectOption<T>[] }[] = [];
  for (const o of shown) {
    const last = groups[groups.length - 1];
    if (last && last.name === o.group) last.items.push(o);
    else groups.push({ name: o.group, items: [o] });
  }

  const triggerMeta = [selected?.meta, selected?.hint].filter(Boolean).join(" · ");

  return (
    <div ref={rootRef} className="flex flex-col gap-1" onKeyDown={onKeyDown}>
      <span id={`${id}-label`} className="t-meta">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
      >
        <span id={`${id}-value`} className="select-value">
          {selected?.label ?? value}
        </span>
        {triggerMeta && <span className="select-meta">{triggerMeta}</span>}
        <span className="select-caret" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="select-panel">
          <label className="select-search">
            <span aria-hidden>/</span>
            <input
              ref={searchRef}
              role="combobox"
              aria-expanded
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-activedescendant={active != null ? optionId(active) : undefined}
              aria-label={`Search ${label.toLowerCase()}`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(
                  options.find((o) => matches(o, e.target.value))?.value ?? null
                );
              }}
              placeholder={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="select-list"
          >
            {groups.map((g, gi) => (
              <div key={`${g.name}-${gi}`} role="group" aria-label={g.name}>
                {g.name && (
                  <div className="select-group" aria-hidden>
                    {g.name}
                  </div>
                )}
                {g.items.map((o) => (
                  <div
                    key={o.value}
                    id={optionId(o.value)}
                    role="option"
                    aria-selected={o.value === value}
                    className={`select-option${o.value === active ? " is-active" : ""}`}
                    // Keep focus on the search line so the keyboard keeps working.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o.value)}
                  >
                    <span className="select-check" aria-hidden />
                    <span className="min-w-0 truncate">{o.label}</span>
                    <span className="select-hint">{o.hint}</span>
                    <span className="select-opt-meta">{o.meta}</span>
                  </div>
                ))}
              </div>
            ))}
            {shown.length === 0 && (
              <p className="select-empty">
                Nothing matches &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>
          <div className="select-foot t-meta" aria-hidden>
            ↑↓ move · ⏎ pick · esc close
          </div>
        </div>
      )}
    </div>
  );
}
