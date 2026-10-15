-- Listser 0018: pick your own avatar color.
--
-- avatar_color is a palette key (see src/lib/members.ts). Null means automatic:
-- the color is picked from the user id, as before. household_member_list
-- returns it so everyone in the household sees the same color.

alter table public.user_settings
  add column if not exists avatar_color text
    check (avatar_color in (
      'lime', 'pink', 'cobalt', 'green', 'orange', 'violet', 'cyan', 'ink'
    ));

-- The return type changes, so the function has to be dropped first.
drop function if exists public.household_member_list(uuid);
create function public.household_member_list(p_household_id uuid)
returns table (user_id uuid, email text, avatar_color text)
language sql stable security definer
set search_path = public
as $$
  select m.user_id, u.email::text, s.avatar_color
  from household_members m
  join auth.users u on u.id = m.user_id
  left join user_settings s on s.user_id = m.user_id
  where m.household_id = p_household_id
    and is_household_member(p_household_id)
  order by m.joined_at;
$$;
