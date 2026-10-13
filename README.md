# Listser

One shared shopping list for your household. Mobile-first PWA built with
Next.js (App Router) and Supabase (auth, Postgres + RLS, realtime).

**v1 scope:** magic-link sign-in, one household joined via invite link, one
shared "Groceries" list with optimistic add/check/uncheck that syncs in
realtime between phones.

## Setup

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the files in
   [`supabase/migrations/`](supabase/migrations/) in order
   (`0001_init.sql`, then `0002_aisle_order.sql`). This creates the tables,
   row-level-security policies, the `create_household` / `join_household` /
   `record_trip` RPCs, and enables realtime on `list_items`.

### 2. Configure auth

1. In **Authentication → URL Configuration**, set the **Site URL** to your
   deployed URL (or `http://localhost:3000` while developing) and add
   `http://localhost:3000/auth/callback` (and your production
   `/auth/callback`) to **Redirect URLs**.
2. Magic-link email is on by default — nothing else to enable.

### 3. Run the app

```bash
cp .env.example .env.local   # fill in your project URL + anon key
npm install
npm run dev
```

Open http://localhost:3000, sign in with your email, create a household,
then tap **Invite** and send the link to the other person — opening it signs
them up and drops them straight into the shared list.

## How it works

- `supabase/migrations/0001_init.sql` — schema: `households` →
  `household_members` → `lists` → `list_items`. All access is enforced by
  RLS (`is_household_member`). Creating/joining households goes through
  `security definer` RPCs so membership rows stay consistent.
- `src/proxy.ts` — refreshes the Supabase session cookie and redirects
  signed-out visitors to `/login` (preserving `?next=` so invite links
  survive the auth round-trip).
- `src/components/ShoppingList.tsx` — the whole UX. Adds and checkoffs are
  optimistic (instant local state), then reconciled against Supabase
  realtime events, so the list feels instant and the other phone updates
  within a second.
- **Aisle-order sorting** — the list groups itself by grocery category in a
  canonical "store walk" order from day one (`src/lib/categories.ts`, a
  merged English + Latvian stem dictionary — no language setting needed).
  Tapping **Done** after a trip calls the `record_trip` RPC
  (`0002_aisle_order.sql`), which folds the checkoff order into
  per-household `item_stats`; learned positions gradually override the
  built-in order, so after a few trips the list mirrors your actual store.
  Zero configuration.

## MCP server

Listser exposes an [MCP](https://modelcontextprotocol.io) server at
`/api/mcp` so AI assistants (Claude, Cursor, …) can read and manage your
households, lists, items and templates: "add milk and eggs to groceries",
"what's left on my to-do?", "finish the trip".

Auth uses Supabase's OAuth 2.1 server. The assistant signs you in with your
normal Listser account, and its token is an ordinary user JWT, so every tool
goes through the same RLS policies as the app.

### Enable it (once per Supabase project)

In the Supabase dashboard, go to **Authentication → OAuth Server**:

1. Enable the OAuth 2.1 server.
2. Set the **authorization path** to `/oauth/consent`. This is resolved
   against the Site URL from step 2 of Setup.
3. Enable **dynamic client registration** so MCP clients can register
   themselves.

### Connect a client

- **Claude (claude.ai / desktop):** Settings → Connectors → Add custom
  connector → `https://<your-domain>/api/mcp`.
- **Claude Code:** `claude mcp add --transport http listser https://<your-domain>/api/mcp`,
  then run `/mcp` to sign in.

The client opens a browser, you sign in with Google if needed, and you
approve the request on `/oauth/consent`.

### Tools

| Area | Tools |
|---|---|
| Households | `list_households`, `create_household`, `join_household` |
| Lists | `list_lists`, `create_list`, `delete_list` |
| Items | `get_items`, `add_items`, `update_item`, `set_items_checked`, `delete_items` |
| Grocery | `finish_trip` (runs `record_trip`), `buy_again` |
| Templates | `list_templates`, `create_template`, `apply_template`, `delete_template` |

Code: `src/app/api/mcp/route.ts` (endpoint),
`src/lib/mcp/tools.ts` (tools), `src/lib/supabase/token.ts` (token
verification), `src/app/.well-known/oauth-protected-resource/route.ts`
(discovery) and `src/app/oauth/consent/` (consent screen).

## Calendar feed

**Menu → Integrations → Calendar** gives each user a private iCalendar link
(`/api/calendar/<token>.ics`) to subscribe to in Google Calendar, Apple
Calendar or Outlook. It lists the top-level to-dos with a due date in every
household they belong to (or only the ones that remind them), as all-day
events.

- Repeats counted from the due date become repeating events (`RRULE`).
  Repeats counted from completion can't be expressed in iCalendar, so they
  show only the next date, which moves when the task is checked off.
- The token in the URL is the only credential, since calendar apps can't
  sign in. **Reset link** issues a new one; **Turn off** deletes it.
- Calendar apps poll on their own schedule: Google every few hours, Apple and
  Outlook as configured. It's a view, not live sync.
- Each task's editor also has **Add to calendar**, a one-off `.ics` download.

Code: `supabase/migrations/0014_calendar_feeds.sql` (table + RPCs),
`src/app/api/calendar/[token]/route.ts` (feed), `src/lib/ical.ts`
(iCalendar output) and `src/components/CalendarFeedForm.tsx` (settings).

## Reminder emails

Each to-do with a due date can remind household members by email (the task
editor picks who). Every user sets a send time and timezone in **Settings →
Reminders**, or turns emails off. On the due date, at or after their send
time, each recipient gets one email per task.

- pg_cron runs every 15 minutes and POSTs to `/api/reminders/send` (through
  pg_net). The route works out what's due with the same recurrence rules as
  the app, records each reminder in `reminder_sends` before sending so none
  goes out twice, and sends through [Resend](https://resend.com).
- A run that's missed still sends later the same day; nothing is sent for a
  date that has passed.
- Each email has a **Stop reminder emails** link (and one-click unsubscribe
  headers) that turns the recipient's reminders off without signing in.

### Enable it (once per deployment)

1. In Resend, verify the domain you'll send from and create an API key.
2. Set these env vars in Vercel (see `.env.example`):
   `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REMINDERS_FROM` and
   `REMINDERS_CRON_SECRET` (a long random string, e.g. `openssl rand -hex 32`).
3. Run `0016_reminder_emails.sql`, then store the app URL and the same secret
   in Vault from the SQL Editor:

   ```sql
   select vault.create_secret('https://<your-domain>', 'reminders_app_url');
   select vault.create_secret('<REMINDERS_CRON_SECRET>', 'reminders_cron_secret');
   ```

   Until both secrets exist the cron job does nothing.

Code: `supabase/migrations/0016_reminder_emails.sql` (send log, RPCs, cron),
`src/app/api/reminders/send/route.ts` (sender),
`src/app/api/reminders/unsubscribe/[token]/route.ts` (unsubscribe) and
`src/lib/reminderEmail.ts` (what's due, email content).

## Deploying

Deploy to Vercel, set the two env vars from `.env.example`, and update the
Supabase Site URL / Redirect URLs to the production domain. On your phones,
use **Add to Home Screen** so it launches like a native app.

## v1 backlog (deliberately cut)

- Multiple households / lists UI (schema already supports it)
- Sets ("taco night" → many items)
- Frequency-based suggestions ("you usually buy milk weekly")
- Offline mutation queue (currently online-optimistic only)
