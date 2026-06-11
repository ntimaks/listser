-- Listser 0002: aisle-order learning.
--
-- Every cleared shopping trip records *where in the trip* each item was
-- checked off (0 = first thing grabbed, 1 = last before checkout) into
-- per-household stats keyed by normalized item name. The client blends
-- these learned positions with a built-in category prior
-- (src/lib/categories.ts) to sort the list in the store's walk order.

-- unaccent strips diacritics so "Āboli" and "aboli" share one stat row.
-- Supabase pre-installs it in the `extensions` schema; plain Postgres
-- installs it into the default schema. The function search_path covers both.
create extension if not exists unaccent;

create table public.item_stats (
  household_id   uuid not null references public.households (id) on delete cascade,
  name_key       text not null check (char_length(name_key) between 1 and 200),
  position_score real not null check (position_score >= 0 and position_score <= 1),
  trip_count     integer not null default 1,
  last_seen_at   timestamptz not null default now(),
  primary key (household_id, name_key)
);

alter table public.item_stats enable row level security;

create policy "members can read item stats"
  on public.item_stats for select
  using (is_household_member(household_id));

-- Writes happen only through record_trip (security definer), so the table
-- stays closed to direct insert/update/delete.

-- Commit a shopping trip: fold the checkoff order of the currently-checked
-- items into item_stats, then delete them (this replaces the client-side
-- "clear checked" delete). Trips under 3 items are deleted without learning
-- — too little signal about store order.
create or replace function public.record_trip(p_list_id uuid)
returns integer
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_household_id uuid;
  v_total        integer;
  v_deleted      integer;
begin
  select household_id into v_household_id from lists where id = p_list_id;
  if v_household_id is null or not is_household_member(v_household_id) then
    raise exception 'not a member of this list';
  end if;

  select count(*) into v_total
  from list_items
  where list_id = p_list_id and checked_at is not null;

  if v_total = 0 then
    return 0;
  end if;

  if v_total >= 3 then
    insert into item_stats (household_id, name_key, position_score, trip_count, last_seen_at)
    select v_household_id, name_key, avg(pos), 1, now()
    from (
      -- Normalization must match normalizeName() in src/lib/categories.ts.
      select
        regexp_replace(lower(unaccent(trim(name))), '\s+', ' ', 'g') as name_key,
        (row_number() over (order by checked_at, id) - 0.5) / v_total as pos
      from list_items
      where list_id = p_list_id and checked_at is not null
    ) ranked
    group by name_key
    on conflict (household_id, name_key) do update set
      -- Exponentially-weighted average: recent trips count more, so the
      -- list adapts if the store layout (or the store) changes.
      position_score = 0.3 * excluded.position_score + 0.7 * item_stats.position_score,
      trip_count     = item_stats.trip_count + 1,
      last_seen_at   = now();
  end if;

  delete from list_items
  where list_id = p_list_id and checked_at is not null;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
