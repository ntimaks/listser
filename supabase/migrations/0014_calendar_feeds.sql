-- Listser 0014: calendar feed for to-do due dates.
--
-- Each user can turn on one private iCalendar feed (an .ics URL they subscribe
-- to in Google Calendar, Apple Calendar or Outlook). Calendar apps can't sign
-- in, so the random token in the URL is the credential: anyone holding the
-- link can read the tasks in it, and resetting the link issues a new token.
--
-- The token is stored as is (readable only by its owner) so the settings page
-- can show the link again; it only grants read access to data the database
-- itself holds, so hashing it would protect nothing a leak hadn't exposed.
--
-- The feed itself is served by /api/calendar/<token>.ics, which has no user
-- session and reads through calendar_feed() below.

create table if not exists public.calendar_feeds (
  user_id         uuid primary key default auth.uid()
                    references auth.users (id) on delete cascade,
  token           text not null unique,
  -- all: every dated task in the user's households.
  -- mine: only tasks that list the user to remind.
  scope           text not null default 'all' check (scope in ('all', 'mine')),
  created_at      timestamptz not null default now(),
  last_fetched_at timestamptz
);

alter table public.calendar_feeds enable row level security;

drop policy if exists "users read their feed" on public.calendar_feeds;
create policy "users read their feed"
  on public.calendar_feeds for select
  using (user_id = auth.uid());

drop policy if exists "users delete their feed" on public.calendar_feeds;
create policy "users delete their feed"
  on public.calendar_feeds for delete
  using (user_id = auth.uid());

-- No insert/update policies: tokens are only ever minted here, never chosen
-- by the client.

-- Turn the feed on, or reset its link. Keeps the scope on a reset. Returns the
-- new token.
create or replace function public.reset_calendar_feed()
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into calendar_feeds (user_id, token)
  values (auth.uid(), v_token)
  on conflict (user_id) do update
    set token = excluded.token,
        created_at = now(),
        last_fetched_at = null;

  return v_token;
end;
$$;

create or replace function public.set_calendar_feed_scope(p_scope text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update calendar_feeds set scope = p_scope where user_id = auth.uid();
end;
$$;

-- Everything the feed needs, for whoever holds `p_token`: the owner's
-- timezone (to place check-offs on the right day) and the top-level dated
-- to-dos in their households. Checked tasks are included only when they
-- repeat, since the feed shows their next occurrence. Returns null for an
-- unknown token.
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
           'household_name', h.name
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
    and (i.checked_at is null or i.repeat_every is not null)
    and (v_feed.scope = 'all' or exists (
      select 1 from item_reminders r
      where r.item_id = i.id and r.user_id = v_feed.user_id
    ));

  return jsonb_build_object(
    'timezone', coalesce(
      (select timezone from user_settings where user_id = v_feed.user_id),
      'UTC'
    ),
    'items', v_items
  );
end;
$$;

-- The feed route calls this with the anon key (no session).
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
