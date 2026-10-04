-- Listser 0011: due dates + recurring to-do tasks.
--
-- due_on is a plain calendar date (no time of day). A task repeats every
-- `repeat_every` days or weeks, counted either from its schedule (bins every
-- other Tuesday) or from when it was last completed (water the plants 5 days
-- after last time).
--
-- Checking a recurring task off is the ordinary checked_at write; the app
-- derives the next date from due_on + checked_at (src/lib/recurrence.ts) and,
-- once it arrives, reopens the task with due_on moved to that date. Due dates
-- and repeats are a to-do feature enforced in the UI, like subtask nesting.
--
-- No new policies: the existing list_items RLS and realtime cover new columns.

alter table public.list_items
  add column if not exists due_on       date,
  add column if not exists repeat_every smallint check (repeat_every between 1 and 365),
  add column if not exists repeat_unit  text     check (repeat_unit in ('day', 'week')),
  add column if not exists repeat_from  text     check (repeat_from in ('schedule', 'completion'));

-- A repeat is all three fields or none, and needs a due date to count from.
alter table public.list_items
  drop constraint if exists list_items_repeat_complete;
alter table public.list_items
  add constraint list_items_repeat_complete check (
    (repeat_every is null) = (repeat_unit is null)
    and (repeat_unit is null) = (repeat_from is null)
    and (repeat_every is null or due_on is not null)
  );

-- For the reminder job (step 3): "which tasks are due on date X".
create index if not exists list_items_due_on_idx
  on public.list_items (due_on)
  where due_on is not null;
