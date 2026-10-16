-- Listser 0019: remove reminders.
--
-- Reminder emails are gone, and with them the per-task recipients and the
-- per-user send settings that 0012 added. This drops:
--
-- - the sending side (the 0016_reminder_emails migration, which only ever
--   ran on production): the pg_cron job, its functions, the send log, the
--   unsubscribe tokens and the Vault secrets it read;
-- - item_reminders and everything that kept it filled;
-- - user_settings.reminders_enabled and send_time;
-- - the calendar feed's "mine" scope, which listed only the tasks that
--   reminded you. Every feed now shows all dated to-dos.
--
-- user_settings itself stays: timezone is still used by the calendar feed and
-- the MCP tools, and avatar_color (0018) lives there. household_member_list
-- stays too; the app uses it for avatars.
--
-- Everything is "if exists", so this runs on a project with or without 0016.

-- ---------------------------------------------------------------------------
-- Sending (0016)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and exists (select 1 from cron.job where jobname = 'send-reminders') then
    perform cron.unschedule('send-reminders');
  end if;

  if exists (select 1 from pg_namespace where nspname = 'vault') then
    delete from vault.secrets
    where name in ('reminders_app_url', 'reminders_cron_secret');
  end if;
end;
$$;

drop function if exists public.invoke_send_reminders();
drop function if exists public.reminder_candidates();
drop function if exists public.claim_reminder(uuid, uuid, date);
drop function if exists public.finish_reminder(uuid, uuid, date, boolean);
drop function if exists public.unsubscribe_reminders(text);

drop table if exists public.reminder_sends;

alter table public.user_settings drop column if exists unsubscribe_token;

-- ---------------------------------------------------------------------------
-- Calendar feed: no more "mine"
-- ---------------------------------------------------------------------------

-- Same as 0015's calendar_feed, without the scope filter.
create or replace function public.calendar_feed(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_feed calendar_feeds;
  v_items jsonb;
begin
  update calendar_feeds set last_fetched_at = now()
  where token = p_token
  returning * into v_feed;

  if v_feed.user_id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
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
           'household_name', h.name,
           'subtasks', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'name', s.name,
                      'checked', s.checked_at is not null
                    ) order by s.created_at), '[]'::jsonb)
             from list_items s
             where s.parent_item_id = i.id
           )
         ) order by i.due_on, i.created_at), '[]'::jsonb)
  into v_items
  from list_items i
  join lists l on l.id = i.list_id
  join households h on h.id = l.household_id
  join household_members m
    on m.household_id = l.household_id and m.user_id = v_feed.user_id
  where l.type = 'todo'
    and i.parent_item_id is null
    and i.due_on is not null
    and (i.checked_at is null or i.repeat_every is not null);

  return jsonb_build_object(
    'timezone', coalesce(
      (select timezone from user_settings where user_id = v_feed.user_id),
      'UTC'
    ),
    'items', v_items
  );
end;
$$;

drop function if exists public.set_calendar_feed_scope(text);
alter table public.calendar_feeds drop column if exists scope;

-- ---------------------------------------------------------------------------
-- Recipients and settings (0012)
-- ---------------------------------------------------------------------------

drop trigger if exists item_reminders_defaults on public.list_items;
drop trigger if exists item_reminders_on_leave on public.household_members;
drop function if exists public.item_reminders_defaults();
drop function if exists public.item_reminders_on_leave();
drop function if exists public.set_item_reminders(uuid, uuid[]);

drop table if exists public.item_reminders;

alter table public.user_settings drop column if exists reminders_enabled;
alter table public.user_settings drop column if exists send_time;
