import Link from "next/link";

type Back = { href: string; name: string };
type Crumb = { href: string; label: string };

// Wrapper for the menu and the pages it opens: a breadcrumb strip from the
// menu down to this page (the menu sits beside your lists, not under one),
// ← one level up, ✕ straight back to the list you came from.
export default function PageShell({
  title,
  back,
  parent,
  children,
}: {
  title: string;
  /** The list to return to (the one you were last on). */
  back: Back;
  /** One level up. The menu itself has none. */
  parent?: Crumb;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-24">
      <header className="panel mt-3">
        <nav aria-label="Breadcrumb" className="term-strip">
          <span aria-hidden className="shrink-0">
            &gt;
          </span>
          {parent && (
            <>
              <Link href={parent.href} className="shrink-0">
                {parent.label}
              </Link>
              <span aria-hidden className="term-strip-dim shrink-0">
                /
              </span>
            </>
          )}
          <span aria-current="page" className="shrink-0">
            {title}
          </span>
        </nav>
        <div className="flex items-center gap-2.5 p-2.5">
          {parent && (
            <Link
              href={parent.href}
              aria-label={`Back to ${parent.label.toLowerCase()}`}
              className="link-plain flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--ink-0)]"
            >
              ←
            </Link>
          )}
          <h1 className="t-h2 min-w-0 flex-1 truncate">{title}</h1>
          <Link
            href={back.href}
            aria-label={`Close, back to ${back.name}`}
            className="link-plain flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--ink-0)]"
          >
            ✕
          </Link>
        </div>
      </header>
      {children}
    </main>
  );
}

// A titled panel for one section of a page.
export function PageSection({
  title,
  code,
  children,
}: {
  title: string;
  code?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <span>{title}</span>
        {code && <span>{code}</span>}
      </div>
      <div className="flex flex-col gap-3 p-3">{children}</div>
    </section>
  );
}

// Marks a feature that has a place in the menu but isn't built yet.
export function SoonTag() {
  return (
    <span className="shrink-0 border border-dashed border-[var(--ink-3)] px-1 py-px text-[9px] tracking-[0.05em] text-[var(--fg-2)]">
      SOON
    </span>
  );
}
