-- v48: several saved MLS links (client-portal QL?D= and smartmls-portal shared-link/<uuid>), each with label,
-- on/off, last run and last result. Locked down like v40: RLS on, no policies, no grants; token-gated RPCs only.
create table if not exists public.mls_sync_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  label text not null default '',
  url text not null unique,
  kind text not null check (kind in ('portal', 'shared')),
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_result jsonb
);
alter table public.mls_sync_links enable row level security;
revoke all on public.mls_sync_links from public, anon, authenticated;

-- carry over the v40 single saved link
insert into public.mls_sync_links (label, url, kind, last_run_at, last_result)
select 'Email portal link (D=)', s.link, 'portal', s.last_run_at, s.last_result
from public.mls_sync_settings s where s.id = 1 and s.link is not null and s.link <> ''
on conflict (url) do nothing;

create or replace function public.mls_sync_links_list(p_token text)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
begin
  perform private.assert_sync_token(p_token);
  return coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.mls_sync_links l), '[]'::jsonb);
end; $$;

-- insert (p_id null) or edit; p_url/p_kind are validated by the API (and constrained here)
create or replace function public.mls_sync_link_save(p_token text, p_id uuid, p_label text, p_url text, p_kind text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.mls_sync_links;
begin
  perform private.assert_sync_token(p_token);
  if p_url is not null and (p_url !~ '^https://[a-z.-]*connectmls\.com/' or length(p_url) > 600) then
    raise exception 'Invalid MLS link';
  end if;
  if p_id is null then
    insert into public.mls_sync_links (label, url, kind, enabled)
    values (left(coalesce(p_label, ''), 120), p_url, p_kind, coalesce(p_enabled, true))
    on conflict (url) do update set label = case when excluded.label <> '' then excluded.label else public.mls_sync_links.label end,
                                    enabled = coalesce(p_enabled, public.mls_sync_links.enabled)
    returning * into r;
  else
    update public.mls_sync_links set
      label = coalesce(left(p_label, 120), label),
      url = coalesce(p_url, url),
      kind = coalesce(p_kind, kind),
      enabled = coalesce(p_enabled, enabled)
    where id = p_id returning * into r;
    if r.id is null then raise exception 'Link not found'; end if;
  end if;
  return to_jsonb(r);
end; $$;

create or replace function public.mls_sync_link_set_result(p_token text, p_id uuid, p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sync_token(p_token);
  update public.mls_sync_links set last_run_at = now(), last_result = p_result where id = p_id;
end; $$;

create or replace function public.mls_sync_link_delete(p_token text, p_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.assert_sync_token(p_token);
  delete from public.mls_sync_links where id = p_id; get diagnostics n = row_count;
  return n;
end; $$;

create or replace function public.mls_sync_link_delete_all(p_token text, p_confirm text)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.assert_sync_token(p_token);
  if p_confirm is distinct from 'DELETE' then raise exception 'Type DELETE to confirm'; end if;
  delete from public.mls_sync_links where true; get diagnostics n = row_count;
  update public.mls_sync_settings set link = null where id = 1;
  return n;
end; $$;

do $$ declare f text; begin
  foreach f in array array[
    'public.mls_sync_links_list(text)',
    'public.mls_sync_link_save(text, uuid, text, text, text, boolean)',
    'public.mls_sync_link_set_result(text, uuid, jsonb)',
    'public.mls_sync_link_delete(text, uuid)',
    'public.mls_sync_link_delete_all(text, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
