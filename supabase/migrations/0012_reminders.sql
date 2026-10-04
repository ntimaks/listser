-- Listser 0012: reminder settings + per-task reminder recipients.
--
-- Each user picks a send time (15-minute steps) and timezone, and can switch
-- reminder emails off. Each dated to-do task has a set of household members to
-- remind. Sending itself (an Edge Function on a cron, plus unsubscribe links)
-- is a later migration; this one only stores who wants what, and when.

-- ---------------------------------------------------------------------------
-- User settings
-- ---------------------------------------------------------------------------

create table if not exists public.user_settings (
  user_id           uuid primary key default auth.uid()
                      references auth.users (id) on delete cascade,
  reminders_enabled boolean not null default true,
  send_time         time    not null default '08:00'
                      check (extract(second from send_time) = 0
                             and extract(minute from send_time)::int % 15 = 0),
  -- IANA name, detected from the browser on first use. Validated below.
  timezone          text    not null default 'UTC',
  updated_at        timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "users read their settings" on public.user_settings;
create policy "users read their settings"
  on public.user_settings for select
  using (user_id = auth.uid());

drop policy if exists "users create their settings" on public.user_settings;
create policy "users create their settings"
  on public.user_settings for insert
  with check (user_id = auth.uid());

drop policy if exists "users update their settings" on public.user_settings;
create policy "users update their settings"
  on public.user_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A CHECK can't query pg_timezone_names, so validate the timezone in a trigger.
create or replace function public.user_settings_validate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'unknown timezone: %', new.timezone;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_settings_validate on public.user_settings;
create trigger user_settings_validate
  before insert or update on public.user_settings
  for each row execute function public.user_settings_validate();

-- ---------------------------------------------------------------------------
-- Reminder recipients
-- ---------------------------------------------------------------------------

create table if not exists public.item_reminders (
  item_id uuid not null references public.list_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (item_id, user_id)
);

create index if not exists item_reminders_user_id_idx
  on public.item_reminders (user_id);

alter table public.item_reminders enable row level security;

-- Readable by members of the item's household. There are no write policies:
-- writes go through set_item_reminders (and the defaults trigger below), which
-- make sure every recipient is a member of that household.
drop policy if exists "members read reminders" on public.item_reminders;
create policy "members read reminders"
  on public.item_reminders for select
  using (exists (
    select 1 from list_items i join lists l on l.id = i.list_id
    where i.id = item_id and is_household_member(l.household_id)
  ));

-- Replace a task's recipients. Ids that aren't members of the task's household
-- are dropped. Returns the recipients actually stored.
create or replace function public.set_item_reminders(p_item_id uuid, p_user_ids uuid[])
returns setof uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select l.household_id into v_household_id
  from list_items i join lists l on l.id = i.list_id
  where i.id = p_item_id;

  if v_household_id is null or not is_household_member(v_household_id) then
    raise exception 'item not found';
  end if;

  delete from item_reminders where item_id = p_item_id;

  return query
    insert into item_reminders (item_id, user_id)
    select p_item_id, m.user_id
    from household_members m
    where m.household_id = v_household_id
      and m.user_id = any (p_user_ids)
    returning user_id;
end;
$$;

-- Defaults: when a top-level task first gets a due date, remind the whole
-- household (the editor lets people untick themselves before saving, by
-- replacing the set right after). Clearing the due date clears recipients, so
-- a date set later starts from the default again. People who join later are
-- not added to existing tasks.
create or replace function public.item_reminders_defaults()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.due_on is null then
    if tg_op = 'UPDATE' and old.due_on is not null then
      delete from item_reminders where item_id = new.id;
    end if;
  elsif new.parent_item_id is null
    and (tg_op = 'INSERT' or old.due_on is null) then
    insert into item_reminders (item_id, user_id)
    select new.id, m.user_id
    from lists l join household_members m on m.household_id = l.household_id
    where l.id = new.list_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists item_reminders_defaults on public.list_items;
create trigger item_reminders_defaults
  after insert or update of due_on on public.list_items
  for each row execute function public.item_reminders_defaults();

-- Someone leaving a household stops getting its reminders.
create or replace function public.item_reminders_on_leave()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  delete from item_reminders r
  using list_items i, lists l
  where r.item_id = i.id
    and i.list_id = l.id
    and l.household_id = old.household_id
    and r.user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists item_reminders_on_leave on public.household_members;
create trigger item_reminders_on_leave
  after delete on public.household_members
  for each row execute function public.item_reminders_on_leave();

-- ---------------------------------------------------------------------------
-- Household members, for the recipient picker
-- ---------------------------------------------------------------------------

-- Emails live in auth.users, which clients can't read; members of a household
-- may see each other's.
create or replace function public.household_member_list(p_household_id uuid)
returns table (user_id uuid, email text)
language sql stable security definer
set search_path = public
as $$
  select m.user_id, u.email::text
  from household_members m join auth.users u on u.id = m.user_id
  where m.household_id = p_household_id
    and is_household_member(p_household_id)
  order by m.joined_at;
$$;
