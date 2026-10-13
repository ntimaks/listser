"use client";

import { signOut } from "@/app/actions";
import { clearLocalData } from "@/lib/idb";
import { resetOutbox } from "@/lib/outbox";

// Signing out also forgets what this device saved for offline use: the lists,
// unsent changes and the cached pages.
export default function SignOutForm() {
  async function action() {
    resetOutbox();
    await clearLocalData();
    await signOut();
  }

  return (
    <form action={action} className="mt-auto">
      <button type="submit" className="btn btn-danger w-full">
        [SIGN OUT]
      </button>
    </form>
  );
}
