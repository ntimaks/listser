-- Listser 0003: per-store aisle learning + store name on lists.
--
-- Before: item_stats is keyed by (household_id, name_key), so shopping at
-- multiple stores produces a blended (meaningless) aisle order.
-- After: stats are keyed by (list_id, name_key) so each store list learns
-- its own layout independently.

-- 1. Optional store label on each list (e.g. "Rimi", "Maxima").
alter table public.lists
  add column store_name text check (char_length(store_name) between 1 and 80);

-- 2. Recreate item_stats keyed by list_id instead of household_id.
--    Existing stats are discarded — they blended multiple stores anyway.
drop table public.item_stats;

create table public.item_stats (
  list_id        uuid not null references public.lists (id) on delete cascade,
  name_key       text not null check (char_length(name_key) between 1 and 200),
  position_score real not null check (position_score >= 0 and position_score <= 1),
  trip_count     integer not null default 1,
  last_seen_at   timestamptz not null default now(),
  primary key (list_id, name_key)
);

alter table public.item_stats enable row level security;

create policy "members can read item stats"
  on public.item_stats for select
  using (exists (
    select 1 from lists l
    where l.id = list_id and is_household_member(l.household_id)
  ));

-- 3. Update record_trip to write stats keyed by list_id.
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
    insert into item_stats (list_id, name_key, position_score, trip_count, last_seen_at)
    select p_list_id, name_key, avg(pos), 1, now()
    from (
      -- Normalization must match normalizeName() in src/lib/categories.ts.
      select
        regexp_replace(lower(unaccent(trim(name))), '\s+', ' ', 'g') as name_key,
        (row_number() over (order by checked_at, id) - 0.5) / v_total as pos
      from list_items
      where list_id = p_list_id and checked_at is not null
    ) ranked
    group by name_key
    on conflict (list_id, name_key) do update set
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
