"use client";

import Link from "next/link";
import { useEffect } from "react";
import ListSwitcher from "@/components/ListSwitcher";
import MemberAvatar from "@/components/MemberAvatar";
import MenuIcon from "@/components/MenuIcon";
import Pixl from "@/components/Pixl";
import { createClient } from "@/lib/supabase/client";
import { rememberList } from "@/lib/lastList";
import { memberName } from "@/lib/members";
import { detectTimeZone, type Member } from "@/lib/reminders";
import type { ListSummary } from "@/lib/household";

const MAX_AVATARS = 4;

// Header shared by every list view: a terminal strip with the household and
// its members, the list switcher, and the button to the full-screen menu.
export default function ListHeader({
  lists,
  activeListId,
  openCounts,
  householdId,
  householdName,
  members,
  userId,
}: {
  lists: ListSummary[];
  activeListId: string;
  openCounts: Record<string, number>;
  householdId: string;
  householdName: string;
  members: Member[];
  userId: string;
}) {
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

  // The menu pages link back here, and the app reopens here.
  useEffect(() => {
    rememberList(activeListId);
  }, [activeListId]);

  const shown = members.slice(0, MAX_AVATARS);
  const hidden = members.length - shown.length;

  return (
    <header className="panel mt-3">
      <div className="term-strip justify-between">
        <span className="flex min-w-0 items-center gap-1.5">
          <Pixl motion="idle" size={11} title="Pixl, the resident" />
          <span className="truncate">LISTSER // {householdName}</span>
        </span>
        {members.length > 0 && (
          <Link
            href="/household"
            aria-label={`Household: ${members.map((m) => memberName(m.email)).join(", ")}`}
            className="link-avatars flex shrink-0 items-center py-1"
          >
            {shown.map((m, i) => (
              <MemberAvatar
                key={m.user_id}
                userId={m.user_id}
                email={m.email}
                size={22}
                className={i > 0 ? "-ml-1" : ""}
              />
            ))}
            {hidden > 0 && (
              <span className="-ml-1 flex h-[22px] min-w-[22px] items-center justify-center border border-[var(--ink-0)] bg-[var(--paper-1)] px-0.5 font-[family-name:var(--ff-mono)] text-[9px] font-bold text-[var(--fg)]">
                +{hidden}
              </span>
            )}
          </Link>
        )}
      </div>

      <div className="flex items-stretch gap-2 p-2.5">
        <ListSwitcher
          lists={lists}
          activeListId={activeListId}
          openCounts={openCounts}
          householdId={householdId}
        />
        <Link
          href="/menu"
          aria-label="Menu"
          className="link-plain flex w-[52px] shrink-0 flex-col items-center justify-center gap-1.5 border border-[var(--ink-0)] bg-[var(--paper-0)] py-1.5"
        >
          <MenuIcon />
          <span className="text-[9px] font-bold tracking-[0.1em]">MENU</span>
        </Link>
      </div>
    </header>
  );
}
