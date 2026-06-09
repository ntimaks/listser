-- Listser v1 schema: households -> lists -> items, joined via invite links.
-- Run this in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  created_at   timestamptz not null default now()
);

create table public.list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  checked_by uuid references auth.users (id)
);

create index list_items_list_id_idx on public.list_items (list_id, created_at);
create index lists_household_id_idx on public.lists (household_id);
create index household_members_user_id_idx on public.household_members (user_id);

-- Realtime needs full row data on UPDATE/DELETE events.
alter table public.list_items replica identity full;

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer avoids recursive policy lookups)
-- ---------------------------------------------------------------------------

create or replace function public.is_household_member(hh uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = hh and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;

create policy "members can read their households"
  on public.households for select
  using (is_household_member(id));

create policy "members can read membership of their households"
  on public.household_members for select
  using (is_household_member(household_id));

create policy "members can read lists"
  on public.lists for select
  using (is_household_member(household_id));

create policy "members can create lists"
  on public.lists for insert
  with check (is_household_member(household_id));

create policy "members can read items"
  on public.list_items for select
  using (exists (
    select 1 from lists l
    where l.id = list_id and is_household_member(l.household_id)
  ));

create policy "members can add items"
  on public.list_items for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from lists l
      where l.id = list_id and is_household_member(l.household_id)
    )
  );

create policy "members can update items"
  on public.list_items for update
  using (exists (
    select 1 from lists l
    where l.id = list_id and is_household_member(l.household_id)
  ));

create policy "members can delete items"
  on public.list_items for delete
  using (exists (
    select 1 from lists l
    where l.id = list_id and is_household_member(l.household_id)
  ));

-- Household creation and joining go through RPCs so membership rows are
-- always written consistently (tables stay closed to direct insert).

create or replace function public.create_household(p_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into households (name, created_by)
  values (p_name, auth.uid())
  returning id into v_household_id;

  insert into household_members (household_id, user_id)
  values (v_household_id, auth.uid());

  insert into lists (household_id, name)
  values (v_household_id, 'Groceries');

  return v_household_id;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into v_household_id from households where invite_code = p_code;
  if v_household_id is null then
    raise exception 'invalid invite code';
  end if;

  insert into household_members (household_id, user_id)
  values (v_household_id, auth.uid())
  on conflict do nothing;

  return v_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.list_items;
