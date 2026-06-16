-- Listser 0005: allow members to delete lists and individual items via policy.
--
-- list_items already has a delete policy (0001_init.sql); lists did not.
-- Deleting a list cascades to list_items and item_stats automatically.

create policy "members can delete lists"
  on public.lists for delete
  using (is_household_member(household_id));
