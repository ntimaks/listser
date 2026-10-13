import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

// The "Stop reminder emails" link in reminder emails (0016). The token in the
// URL is the credential, like the calendar feed.
//
// GET only shows a confirm button, because mail scanners open links on their
// own. POST turns reminders off: from that button, or straight from the mail
// app's one-click unsubscribe (RFC 8058, List-Unsubscribe-Post).

const TOKEN = /^[0-9a-f]{48}$/;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · LISTSER</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 48px 16px; font: 15px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #fff; color: #111; }
  @media (prefers-color-scheme: dark) { body { background: #0e0e0e; color: #eee; } button { background: #eee; color: #111; } }
  main { max-width: 420px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { margin: 0 0 24px; opacity: .75; }
  button { font: inherit; font-weight: 700; padding: 10px 16px; border: 0; background: #111; color: #fff; cursor: pointer; }
  a { color: inherit; }
</style></head>
<body><main><h1>${title}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const notFound = () =>
  page("Link not valid", "<p>This unsubscribe link isn't valid any more.</p>", 404);

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/reminders/unsubscribe/[token]">
) {
  const { token } = await ctx.params;
  if (!TOKEN.test(token)) return notFound();
  return page(
    "Stop reminder emails?",
    `<p>You won't get due-date emails for any task. Tasks keep you as a recipient, and you can turn emails back on in Settings.</p>
<form method="post"><button type="submit">Stop reminder emails</button></form>`
  );
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/reminders/unsubscribe/[token]">
) {
  const { token } = await ctx.params;
  if (!TOKEN.test(token)) return notFound();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.rpc("unsubscribe_reminders", {
    p_token: token,
  });
  if (error) {
    return page("Something went wrong", "<p>Couldn't update your settings. Try again.</p>", 503);
  }
  if (!data) return notFound();

  const settings = `${request.nextUrl.origin}/settings`;
  return page(
    "Reminder emails stopped",
    `<p>You won't get reminder emails any more. To turn them back on, go to <a href="${settings}">Settings</a>.</p>`
  );
}
