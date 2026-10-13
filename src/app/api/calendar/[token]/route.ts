import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { buildCalendar, type CalendarTask } from "@/lib/ical";
import { localDate, upcomingDue } from "@/lib/recurrence";

// The private calendar feed (0014): /api/calendar/<token>.ics. Calendar apps
// fetch it without a session, so the token is the credential and the data
// comes from the calendar_feed RPC rather than through RLS.

type FeedItem = CalendarTask & {
  checked_at: string | null;
  list_id: string;
};

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/calendar/[token]">
) {
  const { token: segment } = await ctx.params;
  const token = segment.replace(/\.ics$/i, "");
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.rpc("calendar_feed", {
    p_token: token,
  });
  if (error) return new Response("Feed unavailable", { status: 503 });
  if (!data) return new Response("Not found", { status: 404 });

  const { timezone, items } = data as { timezone: string; items: FeedItem[] };
  const today = localDate(new Date(), timezone);
  const origin = request.nextUrl.origin;

  const events = items.flatMap((task) => {
    const due = upcomingDue(task, today, timezone);
    return due ? [{ task, due, appUrl: `${origin}/?list=${task.list_id}` }] : [];
  });

  return new Response(buildCalendar({
      name: "Listser",
      description: "To-dos with a due date, from Listser",
      events,
    }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="listser.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
