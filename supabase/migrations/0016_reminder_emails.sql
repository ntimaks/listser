-- Listser 0016: sending reminder emails.
--
-- 0012 stored who wants reminders and when. This adds the sending side:
--
-- - pg_cron runs every 15 minutes (send times are in 15-minute steps) and
--   POSTs to the app's /api/reminders/send through pg_net. The app URL and a
--   shared secret live in Vault, so neither is in this file (see README).
-- - The route reads candidates through reminder_candidates(), works out in
--   TypeScript which tasks are due today for each recipient (the same
--   recurrence rules as the app and the calendar feed), claims each one in
--   reminder_sends and emails it through Resend.
-- - Each email carries an unsubscribe link with the recipient's
--   unsubscribe_token; opening it switches reminders_enabled off.
--
-- A reminder goes out once per task, recipient and due date, at or after the
-- recipient's send time on that date in their timezone. A run that is missed
-- (or a send time moved later in the day) still sends later the same day;
-- nothing is sent for a date that has passed.

create extension if not exists pg_cron;
-- Its functions live in the `net` schema; this only keeps the extension
-- itself out of public.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Unsubscribe tokens
-- ---------------------------------------------------------------------------

-- Like the calendar feed token (0014), the link is the credential: it can
-- only turn the recipient's own reminders off.
alter table public.user_settings
  add column if not exists unsubscribe_token text not null unique
    default encode(extensions.gen_random_bytes(24), 'hex');

-- The link in an email turns reminders off without signing in. Returns false
-- for an unknown token.
create or replace function public.unsubscribe_reminders(p_token text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  update user_settings set reminders_enabled = false
  where unsubscribe_token = p_token;
  return found;
end;
$$;

revoke all on function public.unsubscribe_reminders(text) from public;
grant execute on function public.unsubscribe_reminders(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Send log
-- ---------------------------------------------------------------------------

-- One row per reminder sent (or being sent). The primary key is what keeps a
-- reminder from going out twice when runs overlap or retry.
create table if not exists public.reminder_sends (
  item_id    uuid not null references public.list_items (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  due_on     date not null,
  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  primary key (item_id, user_id, due_on)
);

create index if not exists reminder_sends_user_id_idx
  on public.reminder_sends (user_id);

-- Only the service role touches it; RLS on with no policies shuts everyone
-- else out.
alter table public.reminder_sends enable row level security;

-- ---------------------------------------------------------------------------
-- Candidates
-- ---------------------------------------------------------------------------

-- Everyone who might get a reminder now, with their settings and the tasks
-- that list them: top-level dated to-dos that are open, or checked but
-- repeating (they may be back today). The route decides which are due.
--
-- Recipients without a settings row get the defaults (08:00 UTC, on); a row
-- is created for them here so they have an unsubscribe token.
create or replace function public.reminder_candidates()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  insert into user_settings (user_id)
  select distinct r.user_id
  from item_reminders r
  where not exists (select 1 from user_settings s where s.user_id = r.user_id)
  on conflict (user_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id,
           'email', u.email,
           'timezone', s.timezone,
           'send_time', to_char(s.send_time, 'HH24:MI'),
           'unsubscribe_token', s.unsubscribe_token,
           'items', t.items
         )), '[]'::jsonb)
  into v_result
  from user_settings s
  join auth.users u on u.id = s.user_id
  cross join lateral (
    select jsonb_agg(jsonb_build_object(
             'id', i.id,
             'name', i.name,
             'notes', i.notes,
             'due_on', i.due_on,
             'repeat_every', i.repeat_every,
             'repeat_unit', i.repeat_unit,
             'repeat_from', i.repeat_from,
             'checked_at', i.checked_at,
             'list_id', l.id,
             'list_name', l.name,
             'household_name', h.name
           ) order by i.due_on, i.created_at) as items
    from item_reminders r
    join list_items i on i.id = r.item_id
    join lists l on l.id = i.list_id
    join households h on h.id = l.household_id
    where r.user_id = s.user_id
      and l.type = 'todo'
      and i.parent_item_id is null
      and i.due_on is not null
      and (i.checked_at is null or i.repeat_every is not null)
  ) t
  where s.reminders_enabled
    and u.email is not null
    and t.items is not null;

  return v_result;
end;
$$;

-- Claim one reminder before sending it. False when it was already claimed,
-- so concurrent runs can't both send it.
create or replace function public.claim_reminder(
  p_item_id uuid, p_user_id uuid, p_due_on date
)
returns boolean
language sql security definer
set search_path = public
as $$
  with claimed as (
    insert into reminder_sends (item_id, user_id, due_on)
    values (p_item_id, p_user_id, p_due_on)
    on conflict do nothing
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- After a send: mark it sent, or release the claim so the next run retries.
create or replace function public.finish_reminder(
  p_item_id uuid, p_user_id uuid, p_due_on date, p_sent boolean
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_sent then
    update reminder_sends set sent_at = now()
    where item_id = p_item_id and user_id = p_user_id and due_on = p_due_on;
  else
    delete from reminder_sends
    where item_id = p_item_id and user_id = p_user_id and due_on = p_due_on
      and sent_at is null;
  end if;
end;
$$;

-- The route calls these with the service role key only.
revoke all on function public.reminder_candidates() from public, anon, authenticated;
revoke all on function public.claim_reminder(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.finish_reminder(uuid, uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.reminder_candidates() to service_role;
grant execute on function public.claim_reminder(uuid, uuid, date) to service_role;
grant execute on function public.finish_reminder(uuid, uuid, date, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------

-- Reads the app URL and secret from Vault. Until both are set it does
-- nothing, so the job is harmless on a project that isn't wired up yet.
create or replace function public.invoke_send_reminders()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'reminders_app_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'reminders_cron_secret';

  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/reminders/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.invoke_send_reminders() from public, anon, authenticated;

-- cron.schedule replaces a job with the same name, so this is safe to rerun.
select cron.schedule(
  'send-reminders',
  '*/15 * * * *',
  'select public.invoke_send_reminders()'
);
