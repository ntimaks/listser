// Loading placeholders that mirror the real screens box for box, so content
// drops into place instead of shifting the page. Used by the routes'
// loading.tsx files. Purely visual: the <main> wrapper carries aria-busy.

// A grey block standing in for text or a control. Pulses in steps, per the
// brand's no-easing motion rule.
export function Bone({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <span aria-hidden className={`skel block ${className}`} style={style} />;
}

// Same box as the real terminal strip, with a blinking cursor where the text
// will be.
function StripSkeleton({ label }: { label?: string }) {
  return (
    <div className="term-strip">
      <span aria-hidden>&gt;</span>
      {label && <span>{label}</span>}
      <span aria-hidden className="loading-cursor">
        █
      </span>
    </div>
  );
}

// Varied widths so the rows read as a list of different items, not a grid.
const ROW_WIDTHS = ["w-2/5", "w-3/5", "w-1/3", "w-1/2", "w-2/3", "w-1/4"];

// One item row: checkbox, name, trailing meta. Matches .item-row's padding.
function RowSkeleton({ width }: { width: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-[var(--ink-5)] px-3 py-3">
      <Bone className="h-[18px] w-[18px] shrink-0" />
      <Bone className={`h-3.5 ${width}`} />
      <Bone className="ml-auto h-2.5 w-10 shrink-0 skel-dim" />
    </li>
  );
}

// The list screen: ListHeader, the sticky add box, and a column of rows.
export function ListSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading list"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24"
    >
      <header className="panel mt-3">
        <StripSkeleton label="LISTSER" />
        <div className="flex items-stretch gap-2 p-2.5">
          {/* List switcher */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 border border-[var(--ink-0)] bg-[var(--paper-0)] px-2.5 py-2 shadow-[var(--sh-stamp)]">
            <Bone className="h-2.5 w-16 skel-dim" />
            <Bone className="h-5 w-3/5" />
          </div>
          {/* Menu button */}
          <div className="flex w-[52px] shrink-0 flex-col items-center justify-center gap-1.5 border border-[var(--ink-0)] bg-[var(--paper-0)] py-1.5">
            <Bone className="h-4 w-5" />
            <Bone className="h-2 w-8 skel-dim" />
          </div>
        </div>
      </header>

      <ListBodySkeleton />
    </main>
  );
}

// Everything below the header: the add box and a column of rows. Also shown
// on its own when switching to a list that hasn't loaded yet.
export function ListBodySkeleton() {
  return (
    <div aria-busy="true">
      {/* Add box */}
      <div className="flex gap-2 pb-3 pt-3">
        <div className="field flex min-w-0 flex-1 items-center">
          <Bone className="h-4 w-1/2 skel-dim" />
        </div>
        <div className="btn btn-acid shrink-0 opacity-50">+ ADD</div>
      </div>

      <div className="t-meta flex items-center justify-between border-b border-[var(--ink-5)] px-1 pb-1.5">
        <Bone className="h-2.5 w-20" />
        <Bone className="h-2.5 w-6 skel-dim" />
      </div>
      <ul className="flex flex-col">
        {ROW_WIDTHS.map((w, i) => (
          <RowSkeleton key={i} width={w} />
        ))}
      </ul>
    </div>
  );
}

// PageShell's header with the title already filled in (it's known up front),
// so only the data below it is a placeholder.
function PageHeaderSkeleton({
  title,
  hasParent,
}: {
  title: string;
  hasParent: boolean;
}) {
  return (
    <header className="panel mt-3">
      <div className="term-strip">
        <span aria-hidden className="shrink-0">
          &gt;
        </span>
        {hasParent && (
          <>
            <span className="shrink-0">MENU</span>
            <span aria-hidden className="term-strip-dim shrink-0">
              /
            </span>
          </>
        )}
        <span className="shrink-0">{title}</span>
        <span aria-hidden className="loading-cursor">
          █
        </span>
      </div>
      <div className="flex items-center gap-2.5 p-2.5">
        {hasParent && (
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--ink-0)] text-[var(--fg-disabled)]"
          >
            ←
          </span>
        )}
        <h1 className="t-h2 min-w-0 flex-1 truncate">{title}</h1>
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--ink-0)] text-[var(--fg-disabled)]"
        >
          ✕
        </span>
      </div>
    </header>
  );
}

// A PageSection-shaped panel with placeholder lines.
export function SectionSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <Bone className="h-2.5 w-20" />
        <Bone className="h-2.5 w-10 skel-dim" />
      </div>
      <div className="flex flex-col gap-3 p-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <Bone className={`h-3 ${i % 2 ? "w-1/3" : "w-1/2"}`} />
            <Bone className="h-3 w-1/4 skel-dim" />
          </div>
        ))}
      </div>
    </section>
  );
}

// A member row: avatar, name, email.
export function MemberRowSkeleton({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--ink-5)] px-3 py-2.5 last:border-b-0">
      <Bone className="shrink-0" style={{ width: size, height: size }} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Bone className="h-3 w-1/3" />
        <Bone className="h-2.5 w-1/2 skel-dim" />
      </span>
    </div>
  );
}

// Menu and the pages it opens.
export function PageSkeleton({
  title,
  hasParent = true,
  children,
}: {
  title: string;
  /** False for the menu itself, which has no level above it. */
  hasParent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main
      aria-busy="true"
      aria-label={`Loading ${title.toLowerCase()}`}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-24"
    >
      <PageHeaderSkeleton title={title} hasParent={hasParent} />
      {children}
    </main>
  );
}

// ReminderSettingsForm while it fetches the saved settings: the real labels,
// with placeholders for the controls.
export function ReminderFormSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="t-meta">Email reminders</span>
        <div className="flex gap-1">
          <Bone className="h-8 flex-1" />
          <Bone className="h-8 flex-1" />
        </div>
      </div>
      {["Send time", "Timezone"].map((label) => (
        <div key={label} className="flex flex-col gap-1">
          <span className="t-meta">{label}</span>
          <Bone className="h-11 w-full" />
        </div>
      ))}
      <Bone className="h-3 w-4/5 skel-dim" />
      <Bone className="h-11 w-full" />
    </div>
  );
}
