-- Listser 0009: buy-again suggestions.
--
-- Ranks a grocery list's purchase history (item_purchases, added in 0008) into
-- "you usually buy these" candidates: most-bought first, ties broken by recency.
-- Returns the most recent display name per item so chips read "Pork loin", not
-- the normalized "pork loin".
--
-- SECURITY INVOKER (the default): the function runs as the caller, so the
-- "members can read purchases" RLS policy on item_purchases is what gates
-- access — no SECURITY DEFINER, no extra membership check, no new advisory.

create or replace function public.buy_again(p_list_id uuid, p_limit integer default 12)
returns table (name text, name_key text, buy_count bigint, last_bought_at timestamptz)
language sql
stable
set search_path = public, extensions
as $$
  select
    (array_agg(name order by bought_at desc))[1] as name,
    name_key,
    count(*) as buy_count,
    max(bought_at) as last_bought_at
  from item_purchases
  where list_id = p_list_id
  group by name_key
  order by count(*) desc, max(bought_at) desc
  limit p_limit;
$$;
