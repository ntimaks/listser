-- Listser 0004: quick-add templates.
--
-- Templates belong to a household and contain an ordered list of item names.
-- Any household member can create, apply, or delete templates.

create table public.templates (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now()
);

create table public.template_items (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.templates (id) on delete cascade,
  item_name    text not null check (char_length(item_name) between 1 and 200),
  sort_order   smallint not null default 0
);

create index template_items_template_id_idx
  on public.template_items (template_id, sort_order);

alter table public.templates enable row level security;
alter table public.template_items enable row level security;

create policy "members can read templates"
  on public.templates for select
  using (is_household_member(household_id));

create policy "members can create templates"
  on public.templates for insert
  with check (created_by = auth.uid() and is_household_member(household_id));

create policy "members can delete templates"
  on public.templates for delete
  using (is_household_member(household_id));

create policy "members can read template items"
  on public.template_items for select
  using (exists (
    select 1 from templates t
    where t.id = template_id and is_household_member(t.household_id)
  ));

create policy "members can insert template items"
  on public.template_items for insert
  with check (exists (
    select 1 from templates t
    where t.id = template_id and is_household_member(t.household_id)
  ));

create policy "members can delete template items"
  on public.template_items for delete
  using (exists (
    select 1 from templates t
    where t.id = template_id and is_household_member(t.household_id)
  ));
