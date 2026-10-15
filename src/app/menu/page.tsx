import type { Metadata } from "next";
import Link from "next/link";
import InviteButton from "@/components/InviteButton";
import MemberAvatar from "@/components/MemberAvatar";
import PageShell, { SoonTag } from "@/components/PageShell";
import SignOutForm from "@/components/SignOutForm";
import ThemeToggle from "@/components/ThemeToggle";
import { loadNavContext } from "@/lib/household";
import { memberName } from "@/lib/members";

export const metadata: Metadata = { title: "MENU · LISTSER" };

type Section = { href?: string; label: string; desc: string };

// Where the menu leads. Rows without an href are planned, shown as SOON.
const SECTIONS: Section[] = [
  { href: "/household", label: "HOUSEHOLD", desc: "Members and invite link" },
  { href: "/settings", label: "SETTINGS", desc: "Reminders and appearance" },
  { href: "/integrations", label: "INTEGRATIONS", desc: "Connect Claude" },
  { label: "STATS", desc: "Trips, top items, who did what" },
  { label: "HELP & FEEDBACK", desc: "Tips, report a bug" },
];

// Full-screen menu: you, your household, and the pages behind it.
export default async function MenuPage() {
  const { user, household, members, back } = await loadNavContext({
    members: true,
  });
  const email = user.email ?? "";
  const myColor = members.find((m) => m.user_id === user.id)?.avatar_color;

  return (
    <PageShell title="Menu" back={back}>
      <Link
        href="/settings"
        prefetch
        className="link-plain panel panel-stamp flex items-center gap-3 p-2.5"
      >
        <MemberAvatar
          userId={user.id}
          email={email}
          color={myColor}
          size={44}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-bold uppercase">
            {memberName(email)}
          </span>
          <span className="t-meta">Account &amp; settings</span>
        </span>
        <span aria-hidden className="text-[var(--fg-2)]">
          ▸
        </span>
      </Link>

      <section className="panel">
        <div className="panel-head">
          <span>Household</span>
          <span>{members.length} members</span>
        </div>
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="t-h2 min-w-0 truncate">{household.name}</span>
            <InviteButton
              inviteCode={household.invite_code}
              householdName={household.name}
              className="btn btn-acid shrink-0"
            />
          </div>
          {members.length > 0 && (
            <ul className="flex flex-wrap gap-3">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex w-14 flex-col items-center gap-1"
                >
                  <MemberAvatar
                    userId={m.user_id}
                    email={m.email}
                    color={m.avatar_color}
                    size={36}
                  />
                  <span className="t-small w-full truncate text-center text-[11px]">
                    {m.user_id === user.id ? "You" : memberName(m.email)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <nav aria-label="Sections" className="panel flex flex-col">
        {SECTIONS.map((s) => {
          const body = (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-bold tracking-[0.12em]">
                  {s.label}
                </span>
                <span className="t-small text-[var(--fg-2)]">{s.desc}</span>
              </span>
              {s.href ? (
                <span aria-hidden className="text-[var(--fg-2)]">
                  ▸
                </span>
              ) : (
                <SoonTag />
              )}
            </>
          );
          const row =
            "flex min-h-[54px] items-center gap-3 border-b border-[var(--ink-5)] px-3 last:border-b-0";
          return s.href ? (
            <Link
              key={s.label}
              href={s.href}
              prefetch
              className={`link-plain ${row}`}
            >
              {body}
            </Link>
          ) : (
            <div key={s.label} className={`${row} text-[var(--fg-2)]`}>
              {body}
            </div>
          );
        })}
      </nav>

      <section className="flex flex-col gap-2">
        <p className="t-meta">Theme</p>
        <ThemeToggle />
      </section>

      <SignOutForm />
    </PageShell>
  );
}
