-- Listser 0008: durable purchase log.
--
-- Before: record_trip folds checkoff *positions* into item_stats, then deletes
-- the checked items. The only thing that survives a trip is a blended aisle
-- score — there's no record of *what* was bought or *how often*. Small trips
-- (<3 items) leave no trace at all.
-- After: every checked item is appended to item_purchases before deletion, on
-- every trip regardless of size. This is the history that powers buy-again /
-- recurring-staple suggestions. Position learning (item_stats) is unchanged.

-- Append-only log. Keyed for durability at the household level: a purchase
-- outlives the list it came from (list_id goes null if the list is deleted),
-- so cross-store staples and per-list buy-again can both be read off it.
create table public.item_purchases (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  list_id      uuid references public.lists (id) on delete set null,
  name         text not null check (char_length(name) between 1 and 200),
  -- Normalized identity, matches normalizeName() / record_trip's name_key.
  name_key     text not null check (char_length(name_key) between 1 and 200),
  bought_by    uuid references auth.users (id) on delete set null,
  bought_at    timestamptz not null default now()
);

-- Per-list buy-again ("what do I usually get at this store") and household-wide
-- recency ("what have we bought lately").
create index item_purchases_list_name_idx on public.item_purchases (list_id, name_key);
create index item_purchases_household_bought_idx on public.item_purchases (household_id, bought_at desc);

alter table public.item_purchases enable row level security;

create policy "members can read purchases"
  on public.item_purchases for select
  using (is_household_member(household_id));

-- Writes happen only through record_trip (security definer); no direct
-- insert/update/delete, matching item_stats.

-- Recreate record_trip: log every checked item, then keep the existing
-- learn-positions (>=3 items) + delete behavior verbatim.
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

  -- Log every purchase (no size gate) so buy-again / staples have full history.
  insert into item_purchases (household_id, list_id, name, name_key, bought_by, bought_at)
  select
    v_household_id,
    p_list_id,
    name,
    regexp_replace(lower(unaccent(trim(name))), '\s+', ' ', 'g'),
    checked_by,
    coalesce(checked_at, now())
  from list_items
  where list_id = p_list_id and checked_at is not null;

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
