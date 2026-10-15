# Listser

Shared lists for your household: groceries, to-dos and wishlists. Mobile-first
PWA built with Next.js (App Router) and Supabase (auth, Postgres + RLS,
realtime).

**What it does:** Google sign-in, a household joined via invite link, and any
number of lists of three types:

- **Grocery:** items sort themselves in your store's aisle order, **Done**
  clears the trip, and buy-again chips and templates refill the list.
- **To-do:** one level of subtasks, due dates, repeats and reminder
  recipients. Checked tasks stay as a record.
- **Wishlist:** price, link, importance and effort per wish.

Every change shows instantly, syncs between phones in realtime, and works
offline: writes are queued on the device and sent once you're back online.

## Setup

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run every file in
   [`supabase/migrations/`](supabase/migrations/) in filename order
   (`0001_init.sql` through `0018_avatar_color.sql`; there is no `0016`).
   This creates the tables, row-level-security policies, RPCs and realtime
   publication the app expects. With the Supabase CLI, `supabase db push`
   does the same.

### 2. Configure auth

1. In **Authentication → URL Configuration**, set the **Site URL** to your
   deployed URL (or `http://localhost:3000` while developing) and add
   `http://localhost:3000/auth/callback` (and your production
   `/auth/callback`) to **Redirect URLs**.
2. In **Authentication → Providers**, enable **Google** and fill in the
   client ID and secret from a Google Cloud OAuth client. Sign-in is
   Google-only.

### 3. Run the app

```bash
cp .env.example .env.local   # fill in your project URL + anon key
npm install
npm run dev
```

Open http://localhost:3000, sign in with Google, create a household, then
open **Menu → Household** and send the invite link to the other person.
Opening it signs them in and drops them straight into the shared lists.

## How it works

- **Schema:** `households` → `household_members` → `lists` (typed
  `grocery` / `todo` / `wishlist`) → `list_items`. All access is enforced by
  RLS (`is_household_member`). Creating, joining and renaming households goes
  through `security definer` RPCs so membership rows stay consistent. Each
  migration starts with a comment explaining what it adds.
- `src/proxy.ts` refreshes the Supabase session cookie and redirects
  signed-out visitors to `/login` (preserving `?next=` so invite links
  survive the auth round-trip).
- `src/components/ListApp.tsx` hosts the list switcher
  (`ListSwitcher.tsx`) and renders `GroceryList.tsx` or `SimpleList.tsx`
  (to-dos and wishlists) for the active list. Switching lists happens in the
  browser, without a page load.
- **Offline and sync:** every item change goes through the write queue in
  `src/lib/outbox.ts`. It's applied to the screen at once, saved to
  IndexedDB (`src/lib/idb.ts`), and sent to Supabase in order, retrying while
  offline, even across app restarts. `src/lib/useListStore.ts` keeps the last
  copy of the lists on the device and reconciles with realtime events.
  `public/sw.js` caches the app shell so it opens with no connection.
- **Aisle-order sorting:** grocery lists group themselves by category in a
  canonical "store walk" order from day one (`src/lib/categories.ts`, a
  merged English + Latvian stem dictionary, no language setting needed).
  Tapping **Done** calls the `record_trip` RPC, which logs the purchases to
  `item_purchases` and folds the checkoff order into per-list `item_stats`.
  Learned positions gradually override the built-in order, so each store
  list learns its own layout.
- **Buy again and templates:** the `buy_again` RPC ranks a list's purchase
  history into suggestion chips. Templates are reusable item sets per
  household ("taco night" → many items).
- **Due dates and repeats:** see `src/lib/recurrence.ts`. A checked
  repeating task comes back unchecked on its next due date.

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

## Deploying

Deploy to Vercel, set the two env vars from `.env.example`, and update the
Supabase Site URL / Redirect URLs to the production domain. On your phones,
use **Add to Home Screen** so it launches like a native app.

## Not built yet

- Switching between or leaving households in the app (the schema and the
  MCP server already handle several)
- Sending reminder emails (0012 stores settings and recipients only)
- Export, stats, a public wishlist link and recipe import
