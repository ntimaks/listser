import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import {
  dueNow,
  reminderEmail,
  type ReminderRecipient,
} from "@/lib/reminderEmail";

// Reminder emails (0016). pg_cron POSTs here every 15 minutes with
// `Authorization: Bearer <REMINDERS_CRON_SECRET>`. Each due reminder is
// claimed in reminder_sends before it is emailed, so overlapping runs never
// send it twice, and a failed send releases the claim for the next run.

export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.REMINDERS_CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
  unsubscribe: string;
  idempotencyKey: string;
}): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      // Resend drops a repeat with the same key for 24 hours, covering a crash
      // between sending and recording the send.
      "Idempotency-Key": args.idempotencyKey,
    },
    body: JSON.stringify({
      from: process.env.REMINDERS_FROM,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      html: args.html,
      headers: {
        "List-Unsubscribe": `<${args.unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) {
    console.error("reminder send failed", res.status, await res.text());
  }
  return res.ok;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.RESEND_API_KEY ||
    !process.env.REMINDERS_FROM
  ) {
    return new Response("Reminders are not configured", { status: 503 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase.rpc("reminder_candidates");
  if (error) {
    console.error("reminder_candidates failed", error);
    return new Response("Candidates unavailable", { status: 503 });
  }

  const now = new Date();
  const origin = request.nextUrl.origin;
  let sent = 0;
  let failed = 0;

  for (const recipient of data as ReminderRecipient[]) {
    for (const { task, due } of dueNow(recipient, now)) {
      const key = {
        p_item_id: task.id,
        p_user_id: recipient.user_id,
        p_due_on: due,
      };
      const { data: claimed, error: claimError } = await supabase.rpc(
        "claim_reminder",
        key
      );
      if (claimError) {
        console.error("claim_reminder failed", claimError);
        failed++;
        continue;
      }
      if (!claimed) continue;

      const unsubscribe = `${origin}/api/reminders/unsubscribe/${recipient.unsubscribe_token}`;
      const email = reminderEmail(task, {
        app: `${origin}/?list=${task.list_id}`,
        settings: `${origin}/settings`,
        unsubscribe,
      });

      let ok = false;
      try {
        ok = await sendEmail({
          to: recipient.email,
          ...email,
          unsubscribe,
          idempotencyKey: `reminder/${task.id}/${recipient.user_id}/${due}`,
        });
      } catch (e) {
        console.error("reminder send failed", e);
      }

      await supabase.rpc("finish_reminder", { ...key, p_sent: ok });
      if (ok) sent++;
      else failed++;
    }
  }

  return Response.json({ sent, failed });
}
