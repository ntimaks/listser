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

## Deploying

Deploy to Vercel, set the two env vars from `.env.example`, and update the
Supabase Site URL / Redirect URLs to the production domain. On your phones,
use **Add to Home Screen** so it launches like a native app.

## v1 backlog (deliberately cut)

- Multiple households / lists UI (schema already supports it)
- Sets ("taco night" → many items)
- Frequency-based suggestions ("you usually buy milk weekly")
- Offline mutation queue (currently online-optimistic only)
