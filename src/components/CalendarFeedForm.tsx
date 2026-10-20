"use client";

import { useEffect, useState } from "react";
import CopyField from "@/components/CopyField";
import Hint from "@/components/Hint";
import { Bone } from "@/components/Skeleton";
import { createClient } from "@/lib/supabase/client";

type Feed = { token: string; last_fetched_at: string | null };

// The signed-in user's private calendar feed (0014). Off until they turn it
// on; the link can be reset (old one stops working) or the feed turned off.
export default function CalendarFeedForm({
  userId,
  origin,
}: {
  userId: string;
  origin: string;
}) {
  // undefined while loading, null when the feed is off.
  const [feed, setFeed] = useState<Feed | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("calendar_feeds")
      .select("token, last_fetched_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFeed((data as Feed | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    setError(false);
    const ok = await action();
    setError(!ok);
    setBusy(false);
  }

  const reset = () =>
    run(async () => {
      const { data, error } = await createClient().rpc("reset_calendar_feed");
      if (error || !data) return false;
      setFeed({ token: data as string, last_fetched_at: null });
      setConfirmReset(false);
      return true;
    });

  const turnOff = () =>
    run(async () => {
      const { error } = await createClient()
        .from("calendar_feeds")
        .delete()
        .eq("user_id", userId);
      if (error) return false;
      setFeed(null);
      setConfirmReset(false);
      return true;
    });

  if (feed === undefined) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Bone className="h-3 w-4/5 skel-dim" />
        <Bone className="h-11 w-full" />
      </div>
    );
  }

  const errorLine = error && (
    <p className="t-meta text-[var(--term-red)]">
      {"// "}couldn&rsquo;t save. try again.
    </p>
  );

  if (feed === null) {
    return (
      <>
        <p className="t-small">
          See to-do due dates in Google Calendar, Apple Calendar or Outlook.
          Repeating tasks show up as repeating events.
        </p>
        {errorLine}
        <button onClick={reset} disabled={busy} className="btn btn-acid w-full">
          {busy ? "Turning on…" : "Turn on calendar feed"}
        </button>
      </>
    );
  }

  const feedUrl = `${origin}/api/calendar/${feed.token}.ics`;
  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");

  return (
    <>
      <p className="t-small">
        Subscribe to this link in your calendar app. Anyone with the link can
        see the tasks in it, so keep it to yourself.
      </p>
      <CopyField value={feedUrl} label="Calendar feed URL" />
      <a href={webcalUrl} className="btn btn-cobalt w-full text-center">
        Subscribe
      </a>

      <Hint motion="idle" className="px-0">
        {feed.last_fetched_at
          ? `last fetched ${new Date(feed.last_fetched_at).toLocaleString()} · google refreshes every few hours`
          : "not fetched yet · google refreshes every few hours"}
      </Hint>

      {errorLine}

      <div className="flex gap-2">
        <button
          onClick={confirmReset ? reset : () => setConfirmReset(true)}
          disabled={busy}
          className="btn btn-sm btn-ghost flex-1"
        >
          {confirmReset ? "Tap to confirm" : "Reset link"}
        </button>
        <button
          onClick={turnOff}
          disabled={busy}
          className="btn btn-sm btn-ghost flex-1 active:text-[var(--term-red)]"
        >
          Turn off
        </button>
      </div>
      {confirmReset && (
        <Hint motion="idle" className="px-0">
          the old link stops working · re-subscribe with the new one
        </Hint>
      )}
    </>
  );
}
