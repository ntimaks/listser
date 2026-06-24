"use client";

import { useState } from "react";
import { signOut } from "@/app/actions";
import ListSwitcher from "@/components/ListSwitcher";
import type { ListType } from "@/lib/listTypes";

type ListSummary = {
  id: string;
  name: string;
  store_name: string | null;
  type: ListType;
};

// Common top bar shared by every list view: the list switcher, household name,
// invite button, and sign-out.
export default function ListHeader({
  lists,
  activeListId,
  activeListName,
  activeListStoreName,
  activeListType,
  householdId,
  householdName,
  inviteCode,
}: {
  lists: ListSummary[];
  activeListId: string;
  activeListName: string;
  activeListStoreName: string | null;
  activeListType: ListType;
  householdId: string;
  householdName: string;
  inviteCode: string;
}) {
  const [invited, setInvited] = useState(false);

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
    <header className="flex items-center justify-between py-4">
      <div>
        <ListSwitcher
          lists={lists}
          activeListId={activeListId}
          activeListName={activeListName}
          activeListStoreName={activeListStoreName}
          activeListType={activeListType}
          householdId={householdId}
        />
        <p className="text-xs text-neutral-400">{householdName}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={shareInvite}
          className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm font-medium active:bg-neutral-100 dark:border-neutral-700 dark:active:bg-neutral-800"
        >
          {invited ? "Copied!" : "Invite"}
        </button>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-full px-2 py-1.5 text-sm text-neutral-400 active:text-neutral-600"
            aria-label="Sign out"
          >
            ↩
          </button>
        </form>
      </div>
    </header>
  );
}
