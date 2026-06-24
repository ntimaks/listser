-- Listser 0006: list types (grocery / todo / wishlist) + richer item fields.
--
-- Listser started as a grocery engine: completion deletes items (record_trip)
-- and items get aisle-categorized. That's wrong for todo lists (completing a
-- task should leave a record) and wishlists (long-lived "somedays" that need a
-- rough price / link / priority). This adds a `type` discriminator on lists and
-- a few optional, nullable item fields.
--
-- Idempotent: this may already be applied on databases that ran an earlier
-- draft of this migration, so every statement guards against re-running.

-- 1. List type discriminator. Default keeps every existing list as grocery.
alter table public.lists
  add column if not exists type text not null default 'grocery'
    check (type in ('grocery', 'todo', 'wishlist'));

-- 2. Optional, nullable item fields. priority/price/url are wishlist-centric;
--    notes is shared. Money is stored as integer cents to avoid float rounding.
alter table public.list_items
  add column if not exists priority    text    check (priority in ('soon', 'someday')),
  add column if not exists price_cents integer check (price_cents >= 0),
  add column if not exists url         text    check (char_length(url)   <= 2048),
  add column if not exists notes       text    check (char_length(notes) <= 2000);

-- 3. Harden the update policy. Promotion (moving an item between lists) changes
--    list_id; the original policy (0001) had only a `using` clause. Add an
--    explicit `with check` so a moved item must land on a list the user is also
--    a member of — same-household moves pass, cross-household targets fail.
drop policy if exists "members can update items" on public.list_items;
create policy "members can update items"
  on public.list_items for update
  using (exists (
    select 1 from lists l
    where l.id = list_id and is_household_member(l.household_id)
  ))
  with check (exists (
    select 1 from lists l
    where l.id = list_id and is_household_member(l.household_id)
  ));
