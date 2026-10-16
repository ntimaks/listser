import type { Metadata } from "next";
import AvatarColorPicker from "@/components/AvatarColorPicker";
import PageShell, { PageSection, SoonTag } from "@/components/PageShell";
import ThemeToggle from "@/components/ThemeToggle";
import { loadNavContext } from "@/lib/household";
import { isAvatarColor } from "@/lib/members";

export const metadata: Metadata = { title: "SETTINGS · LISTSER" };

export default async function SettingsPage() {
  const { supabase, user, back } = await loadNavContext();
  // Errors (e.g. before 0018) leave it on automatic.
  const { data: settings } = await supabase
    .from("user_settings")
    .select("avatar_color")
    .eq("user_id", user.id)
    .maybeSingle();
  const avatarColor = isAvatarColor(settings?.avatar_color)
    ? settings.avatar_color
    : null;

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

      <PageSection title="Profile color" code="[PFP]">
        <AvatarColorPicker
          userId={user.id}
          email={user.email ?? ""}
          initial={avatarColor}
        />
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
