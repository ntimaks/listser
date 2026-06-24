-- Listser 0005: list types (grocery / todo / wishlist) + richer item fields.
--
-- Listser started as a grocery engine: completion deletes items (record_trip),
-- and items get aisle-categorized. That's wrong for todo lists (completing a
-- task should leave a record) and wishlists (long-lived "somedays" you never
-- "finish a trip" on). This migration adds a list `type` discriminator plus a
-- few optional, nullable item fields so wishlist items can carry priority, a
-- rough price, a link, and notes.
--
-- Everything here is additive and non-destructive: record_trip (0003) and
-- item_stats are untouched and stay grocery-only. Existing grocery rows read
-- back identical because `type` defaults to 'grocery' and the new item columns
-- are nullable with no default.

-- 1. List type discriminator. Default keeps every existing list as grocery.
alter table public.lists
  add column type text not null default 'grocery'
    check (type in ('grocery', 'todo', 'wishlist'));

-- 2. Optional, nullable item fields. priority/price/url are wishlist-centric;
--    notes is shared (useful for todo and wishlist). Money is stored as integer
--    cents to avoid float rounding.
alter table public.list_items
  add column priority    text    check (priority in ('soon', 'someday')),
  add column price_cents integer check (price_cents >= 0),
  add column url         text    check (char_length(url)   <= 2048),
  add column notes       text    check (char_length(notes) <= 2000);

-- 3. Harden the update policy. Promotion (moving an item between lists) is an
--    UPDATE that changes list_id. The original policy (0001) had only a `using`
--    clause; add an explicit `with check` so a moved item must land on a list
--    the user is also a member of. Same-household moves pass; cross-household
--    targets are rejected.
drop policy "members can update items" on public.list_items;
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
