import type { Metadata } from "next";
import Hint from "@/components/Hint";
import InviteButton from "@/components/InviteButton";
import MemberAvatar from "@/components/MemberAvatar";
import PageShell, { PageSection, SoonTag } from "@/components/PageShell";
import { loadNavContext } from "@/lib/household";
import { memberName } from "@/lib/members";

export const metadata: Metadata = { title: "HOUSEHOLD · LISTSER" };

export default async function HouseholdPage() {
  const { user, household, members, back } = await loadNavContext({
    members: true,
  });

  return (
    <PageShell
      title="Household"
      back={back}
      parent={{ href: "/menu", label: "MENU" }}
    >
      <PageSection title={household.name} code={`${members.length} MEMBERS`}>
        <ul className="-mx-3 -my-3 flex flex-col">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-3 border-b border-[var(--ink-5)] px-3 py-2.5 last:border-b-0"
            >
              <MemberAvatar userId={m.user_id} email={m.email} size={36} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-bold">
                  {memberName(m.email)}
                  {m.user_id === user.id && (
                    <span className="font-normal text-[var(--fg-2)]">
                      {" "}
                      (you)
                    </span>
                  )}
                </span>
                <span className="t-small truncate text-[var(--fg-2)]">
                  {m.email}
                </span>
              </span>
            </li>
          ))}
          {members.length === 0 && (
            <li className="t-small px-3 py-3 text-[var(--fg-2)]">
              {"// "}couldn&rsquo;t load members.
            </li>
          )}
        </ul>
      </PageSection>

      <PageSection title="Invite" code="[LINK]">
        <InviteButton
          inviteCode={household.invite_code}
          householdName={household.name}
          label="[SHARE INVITE LINK]"
          className="btn btn-acid w-full"
        />
        <Hint motion="idle" className="px-0">
          anyone with the link joins {household.name}
        </Hint>
      </PageSection>

      <PageSection title="Manage">
        <div className="flex items-center justify-between gap-3 text-[var(--fg-2)]">
          <span className="t-small">Rename, switch or leave household</span>
          <SoonTag />
        </div>
      </PageSection>
    </PageShell>
  );
}
