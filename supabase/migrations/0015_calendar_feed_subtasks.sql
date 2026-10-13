-- Listser 0015: subtasks in the calendar feed.
--
-- Same as 0014's calendar_feed, plus each task's subtasks (name + checked),
-- so the feed can show progress in the title and a checklist in the notes.

create or replace function public.calendar_feed(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_feed calendar_feeds;
  v_items jsonb;
begin
  update calendar_feeds set last_fetched_at = now()
  where token = p_token
  returning * into v_feed;

  if v_feed.user_id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'name', i.name,
           'notes', i.notes,
           'due_on', i.due_on,
           'repeat_every', i.repeat_every,
           'repeat_unit', i.repeat_unit,
           'repeat_from', i.repeat_from,
           'checked_at', i.checked_at,
           'list_id', l.id,
           'list_name', l.name,
           'household_name', h.name,
           'subtasks', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'name', s.name,
                      'checked', s.checked_at is not null
                    ) order by s.created_at), '[]'::jsonb)
             from list_items s
             where s.parent_item_id = i.id
           )
         ) order by i.due_on, i.created_at), '[]'::jsonb)
  into v_items
  from list_items i
  join lists l on l.id = i.list_id
  join households h on h.id = l.household_id
  join household_members m
    on m.household_id = l.household_id and m.user_id = v_feed.user_id
  where l.type = 'todo'
    and i.parent_item_id is null
    and i.due_on is not null
    and (i.checked_at is null or i.repeat_every is not null)
    and (v_feed.scope = 'all' or exists (
      select 1 from item_reminders r
      where r.item_id = i.id and r.user_id = v_feed.user_id
    ));

  return jsonb_build_object(
    'timezone', coalesce(
      (select timezone from user_settings where user_id = v_feed.user_id),
      'UTC'
    ),
    'items', v_items
  );
end;
$$;
