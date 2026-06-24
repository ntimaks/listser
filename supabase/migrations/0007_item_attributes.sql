-- Listser 0007: rankable item attributes — importance + effort/cost (1–5).
--
-- To-do and wishlist items need to sort themselves usefully. Two generic 1–5
-- attributes do that: importance (how much it matters / how much we want it) and
-- effort (how hard the task is / how costly the wish). "Quick wins" sorting then
-- floats high-importance, low-effort items to the top.
--
-- Wishlist now uses importance in place of the old soon/someday `priority`
-- flag; `priority` stays in the schema (not surfaced) and seeds importance for
-- existing rows so their order survives the switch.

alter table public.list_items
  add column if not exists importance smallint check (importance between 1 and 5),
  add column if not exists effort     smallint check (effort     between 1 and 5);

-- Seed importance from the legacy soon/someday flag (soon = high, someday = low).
update public.list_items set importance = 4 where importance is null and priority = 'soon';
update public.list_items set importance = 2 where importance is null and priority = 'someday';
