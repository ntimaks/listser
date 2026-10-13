"use client";

import { useState } from "react";

// Shares the household's join link (native share sheet when there is one,
// else copies it).
export default function InviteButton({
  inviteCode,
  householdName,
  label = "[+ INVITE]",
  className = "btn btn-acid",
}: {
  inviteCode: string;
  householdName: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={shareInvite} className={className}>
      {copied ? "[LINK COPIED]" : label}
    </button>
  );
}
