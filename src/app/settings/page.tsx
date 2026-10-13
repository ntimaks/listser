import type { Metadata } from "next";
import PageShell, { PageSection, SoonTag } from "@/components/PageShell";
import ReminderSettingsForm from "@/components/ReminderSettingsForm";
import ThemeToggle from "@/components/ThemeToggle";
import { loadNavContext } from "@/lib/household";

export const metadata: Metadata = { title: "SETTINGS · LISTSER" };

export default async function SettingsPage() {
  const { user, back } = await loadNavContext();

  return (
    <PageShell
      title="Settings"
      back={back}
      parent={{ href: "/menu", label: "MENU" }}
    >
      <PageSection title="Account" code="[ACC]">
        <div className="flex items-center justify-between gap-3">
          <span className="t-small text-[var(--fg-2)]">Signed in as</span>
          <span className="t-small min-w-0 truncate">{user.email}</span>
        </div>
      </PageSection>

      <PageSection title="Reminders" code="[REM]">
        <ReminderSettingsForm userId={user.id} />
      </PageSection>

      <PageSection title="Appearance" code="[LOOK]">
        <ThemeToggle />
      </PageSection>

      <PageSection title="Data" code="[DAT]">
        <div className="flex items-center justify-between gap-3 text-[var(--fg-2)]">
          <span className="t-small">Export your lists</span>
          <SoonTag />
        </div>
      </PageSection>
    </PageShell>
  );
}
