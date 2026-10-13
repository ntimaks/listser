-- Listser 0013: let members rename their household.
--
-- Goes through an RPC rather than an update policy so members can change the
-- name only, never the invite code or owner.

create or replace function public.rename_household(p_household_id uuid, p_name text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  update households set name = btrim(p_name) where id = p_household_id;
end;
$$;
