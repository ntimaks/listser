-- Listser 0018: pick your own avatar color.
--
-- avatar_color is a palette key (see src/lib/members.ts). Null means automatic:
-- the color is picked from the user id, as before. household_member_colors
-- lets members see each other's choice (user_settings is readable only by its
-- owner); the app merges it into household_member_list.

alter table public.user_settings
  add column if not exists avatar_color text
    check (avatar_color in (
      'lime', 'pink', 'cobalt', 'green', 'orange', 'violet', 'cyan', 'ink'
    ));

-- Members who picked a color. Everyone else is on automatic.
create or replace function public.household_member_colors(p_household_id uuid)
returns table (user_id uuid, avatar_color text)
language sql stable security definer
set search_path = public
as $$
  select m.user_id, s.avatar_color
  from household_members m
  join user_settings s on s.user_id = m.user_id
  where m.household_id = p_household_id
    and s.avatar_color is not null
    and is_household_member(p_household_id);
$$;
