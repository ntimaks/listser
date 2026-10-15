# Brief: Listser household agent

## Goal

Today Listser only acts when someone opens it or asks Claude through MCP. Reverse that: Listser calls Claude on a schedule, uses its own tools, and proposes changes to the household. People approve or dismiss them.

First use case: **a Sunday grocery draft.** Once a week, propose next week's groceries from purchase history, things that are probably running out, and the to-dos.

## Why

- MCP only helps whoever connects Claude. Proposals in the app help every household member.
- It gets better over time: each trip adds to `item_purchases`, so suggestions sharpen.
- Most of the parts already exist (see below).

## What exists

- `src/lib/mcp/tools.ts`: every list, item, template and `buy_again` tool, tested in `tools.test.ts` with `src/test/fakeSupabase.ts`.
- `item_purchases` (0008) and the `buy_again` RPC (0009): a purchase log with counts and last-bought dates.
- `list_items.source` (0017): `'user' | 'assistant'`, already shown in the UI by `ItemAuthor`.
- Recurrence and due dates for to-dos (`src/lib/recurrence.ts`).
- Reminders schema (0012). **Email sending is not on main.** It lives on the unmerged `claude/reminder-emails` branch.
- Hosted on Vercel (`dub1`). There are no crons in `vercel.json` yet.

## Proposed shape (to pressure-test, not final)

1. **Trigger:** a weekly Vercel cron calls a protected route, for example `/api/agent/run`, with a `CRON_SECRET`.
2. **Per household:** run a Claude API tool loop over the same tools `tools.ts` registers, scoped to that household. Use read tools plus one write tool, `propose_items`.
3. **Proposals, not writes:** proposed items are saved with `source = 'agent'` (needs a migration extending the check) and a `proposed` state. They show dimmed with Accept and Dismiss buttons. Dismissals are recorded so the agent stops suggesting the same thing.
4. **Signals for the grocery draft:** the average gap between purchases per `name_key` (flag items whose gap is now overdue), `buy_again` rank, and items already on the list (never propose those).
5. **Notify:** a small "3 suggestions for this week" badge in the app. A digest email can come later, after reminder emails merge.

## Questions to settle

- **Auth:** the MCP tools run as a user through RLS with a user JWT. The cron has no user. Options: a service-role client with an explicit household filter, or a per-household agent identity. Which is safe and simplest?
- **Data model:** use new `list_items` columns (`source = 'agent'`, `proposed_at`, `dismissed_at`) or a separate `agent_proposals` table? Realtime and the offline outbox (`src/lib/outbox.ts`) both need to handle the choice.
- **LLM or rules?** The grocery draft might be pure SQL (purchase-interval math). Decide where Claude adds real value (wording, merging in to-dos, judging what's relevant) and keep the rest deterministic and testable.
- **Cost and limits:** what model, tokens per household per week, and what happens if a run fails.
- **Opt-in:** a per-household setting in `/settings`, off by default?
- **Explaining itself:** each proposal carries a short reason ("usually every 6 days, last bought 8 days ago"). Where is that stored and shown?

## Out of scope for v1

Rescheduling to-dos, recurring-reminder suggestions, the share target and email-in capture, and digest emails.

## Done looks like

A household with at least 4 weeks of purchases gets a Sunday proposal of about 3 to 10 items with reasons. Accepting one adds it as a normal item, dismissing one hides it, and nothing touches the list without approval. Tests cover the interval math and the proposal lifecycle.
