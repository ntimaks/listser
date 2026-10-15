-- Listser 0017: who an item came from.
--
-- created_by is always a person. source says whether that person added it in
-- the app ('user') or an assistant added it for them through the MCP server
-- ('assistant'), so the list can mark AI-added items. Rows from before this
-- were all added by people.
--
-- No new policies: the existing list_items RLS and realtime cover new columns.

alter table public.list_items
  add column if not exists source text not null default 'user'
    check (source in ('user', 'assistant'));
