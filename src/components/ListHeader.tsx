"use client";

import { useEffect, useState } from "react";
import ListSwitcher from "@/components/ListSwitcher";
import Pixl from "@/components/Pixl";
import SettingsDrawer from "@/components/SettingsDrawer";
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
// switcher, household name, invite, and settings (which holds sign-out).
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
  const [showSettings, setShowSettings] = useState(false);

  // Give every user a settings row with their browser's timezone, so reminders
  // go out at the right local time even if they never open Settings. Leaves an
  // existing row alone.
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
        <span className="flex items-center gap-1.5">
          <Pixl motion="idle" size={11} title="Pixl, the resident" />
          LISTSER // {BAND_LABEL[activeListType]}
        </span>
        <span>
          {stamp(new Date().toISOString())} · {itemCount}{" "}
          {itemCount === 1 ? "ITEM" : "ITEMS"}
        </span>
      </div>
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <ListSwitcher
            lists={lists}
            activeListId={activeListId}
            activeListName={activeListName}
            activeListStoreName={activeListStoreName}
            activeListType={activeListType}
            householdId={householdId}
          />
          <p className="t-meta mt-1 truncate">▸ {householdName}</p>
          <p className="t-meta mt-0.5 truncate text-[var(--fg-muted)]">
            changes sync live · [INVITE] to add people
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={shareInvite} className="btn btn-sm">
            {invited ? "[COPIED]" : "[INVITE]"}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="btn btn-sm btn-ghost"
            aria-label="Settings"
          >
            SET
          </button>
        </div>
      </div>
      {showSettings && (
        <SettingsDrawer userId={userId} onClose={() => setShowSettings(false)} />
      )}
    </header>
  );
}
