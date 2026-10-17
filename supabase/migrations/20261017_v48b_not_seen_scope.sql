-- v48: with several links each run is per link, so "not seen" now means: MLS homes that no saved link has returned
-- in the last 90 minutes (every link stamps last_synced_at on all homes it returns each hour).
do $$
declare def text; fixed text;
begin
  select pg_get_functiondef('public.mls_sync_apply(text, jsonb, boolean, text, text, integer)'::regprocedure) into def;
  fixed := replace(def,
    'l.last_synced_at is not null and not exists (select 1 from pg_temp.mls_h h where h.id = l.id)',
    'l.last_synced_at is not null and l.last_synced_at < now() - interval ''90 minutes'' and not exists (select 1 from pg_temp.mls_h h where h.id = l.id)');
  if fixed = def then raise exception 'pattern not found'; end if;
  execute fixed;
end $$;
