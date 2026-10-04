"use client";

import { useEffect, useState } from "react";
import { signOut } from "@/app/actions";
import Drawer from "@/components/Drawer";
import ListSwitcher from "@/components/ListSwitcher";
import Pixl from "@/components/Pixl";
import SettingsDrawer from "@/components/SettingsDrawer";
import ThemeToggle from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";
import { detectTimeZone } from "@/lib/reminders";
import { stamp } from "@/lib/useListItems";
import type { ListType } from "@/lib/listTypes";

type ListSummary = {
  id: string;
  name: string;
  store_name: string | null;
  type: ListType;
};

const BAND_LABEL: Record<ListType, string> = {
  grocery: "SHOPPING LOG",
  todo: "TASK LOG",
  wishlist: "WISH LOG",
};

// Logbook header band shared by every list view: the panel-head strip, the list
// switcher and household name, plus a menu sheet with invite, reminder
// settings, theme, sign-out.
export default function ListHeader({
  lists,
  activeListId,
  activeListName,
  activeListStoreName,
  activeListType,
  householdId,
  householdName,
  inviteCode,
  userId,
  itemCount,
}: {
  lists: ListSummary[];
  activeListId: string;
  activeListName: string;
  activeListStoreName: string | null;
  activeListType: ListType;
  householdId: string;
  householdName: string;
  inviteCode: string;
  userId: string;
  itemCount: number;
}) {
  const [invited, setInvited] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Give every user a settings row with their browser's timezone, so reminders
  // go out at the right local time even if they never open the settings.
  // Leaves an existing row alone.
  useEffect(() => {
    createClient()
      .from("user_settings")
      .upsert(
        { user_id: userId, timezone: detectTimeZone() },
        { onConflict: "user_id", ignoreDuplicates: true }
      )
      .then(() => {});
  }, [userId]);

  async function shareInvite() {
    const url = `${window.location.origin}/join/${inviteCode}`;
    const text = `Join "${householdName}" on Listser: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Listser", text, url });
        return;
      } catch {
        // fall through to clipboard (user may have dismissed the sheet)
      }
    }
    await navigator.clipboard.writeText(url);
    setInvited(true);
    setTimeout(() => setInvited(false), 2000);
  }

  return (
    <header className="panel mt-3">
      <div className="panel-head">
        <span className="flex min-w-0 items-center gap-1.5">
          <Pixl motion="idle" size={11} title="Pixl, the resident" />
          <span className="truncate">
            LISTSER // {BAND_LABEL[activeListType]}
          </span>
        </span>
        <span className="shrink-0">
          <span className="hidden sm:inline">
            {stamp(new Date().toISOString())} ·{" "}
          </span>
          {itemCount} {itemCount === 1 ? "ITEM" : "ITEMS"}
        </span>
      </div>
      <div className="flex items-center gap-2 py-1.5 pl-3 pr-1.5">
        <div className="min-w-0 flex-1">
          <ListSwitcher
            lists={lists}
            activeListId={activeListId}
            activeListName={activeListName}
            activeListStoreName={activeListStoreName}
            activeListType={activeListType}
            householdId={householdId}
          />
          <p className="t-meta mt-0.5 truncate">▸ {householdName}</p>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--ink-0)] text-lg active:bg-[var(--paper-2)]"
        >
          ≡
        </button>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="MENU">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <p className="t-meta">Household</p>
            <p className="t-h3 truncate uppercase">{householdName}</p>
            <p className="t-small text-[var(--fg-2)]">
              {"// "}changes sync live for everyone in the household.
            </p>
            <button onClick={shareInvite} className="btn w-full">
              {invited ? "[LINK COPIED]" : "[INVITE PEOPLE]"}
            </button>
          </section>

          <section className="flex flex-col gap-2">
            <p className="t-meta">Reminders</p>
            <button
              onClick={() => {
                setMenuOpen(false);
                setSettingsOpen(true);
              }}
              className="btn w-full"
            >
              [EMAIL REMINDERS]
            </button>
          </section>

          <section className="flex flex-col gap-2">
            <p className="t-meta">Theme</p>
            <ThemeToggle />
          </section>

          <form action={signOut}>
            <button type="submit" className="btn btn-danger w-full">
              [SIGN OUT]
            </button>
          </form>
        </div>
      </Drawer>

      {settingsOpen && (
        <SettingsDrawer userId={userId} onClose={() => setSettingsOpen(false)} />
      )}
    </header>
  );
}
