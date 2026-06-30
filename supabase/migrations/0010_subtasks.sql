-- Listser 0010: one level of subtasks for to-do items.
--
-- A subtask is just a list_items row with a non-null parent_item_id and the
-- SAME list_id as its parent. That means the existing RLS policies (which gate
-- on list_id -> household) and the list_id realtime channel already cover
-- subtasks — no new policies, no publication or replica-identity change.
--
-- Cascade delete removes a parent's subtasks along with it. Single-level
-- nesting (no subtasks of subtasks) is enforced in the UI, not the DB.

alter table public.list_items
  add column if not exists parent_item_id uuid
    references public.list_items (id) on delete cascade;

create index if not exists list_items_parent_idx
  on public.list_items (parent_item_id);
