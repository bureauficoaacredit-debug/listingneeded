-- v40: automatic MLS import (SMART MLS client-portal link). Everything secret is locked down:
-- the two new tables have RLS on with NO policies and no grants for anon/authenticated; the only way in is the
-- token-gated SECURITY DEFINER RPCs below (same pattern as get_cma_leads). The sync token's SHA-256 lives in
-- private.admin_secrets (name 'mls_sync'; inserted out-of-band, not in this file). The existing leads access
-- code ('cma_leads') is also accepted so the admin can reuse it.

alter table public.listings add column if not exists mls_status text;
alter table public.listings add column if not exists last_synced_at timestamptz;

create table if not exists public.mls_sync_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  link text,
  last_run_at timestamptz,
  last_result jsonb,
  updated_at timestamptz not null default now()
);
insert into public.mls_sync_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.mls_import_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mode text not null default 'real',          -- 'dry' | 'real'
  source text not null default 'api',         -- 'scheduled' | 'admin' | 'api'
  link_hint text,                             -- masked, e.g. 2PUM…S6PD
  total_count int not null default 0,         -- homes read from the portal
  new_count int not null default 0,
  updated_count int not null default 0,
  unchanged_count int not null default 0,
  not_seen_count int not null default 0,
  skipped_count int not null default 0,       -- skipped by the mapper (closed/sold/no MLS#)
  error_count int not null default 0,
  errors jsonb,
  duration_ms int,
  label text,
  note text
);

alter table public.mls_sync_settings enable row level security;
alter table public.mls_import_log enable row level security;
revoke all on public.mls_sync_settings from public, anon, authenticated;
revoke all on public.mls_import_log from public, anon, authenticated;

create or replace function private.assert_sync_token(p_token text)
returns void language plpgsql security definer set search_path = '' stable as $$
begin
  if p_token is null or length(p_token) < 16 or not exists (
    select 1 from private.admin_secrets s
    where s.name in ('mls_sync', 'cma_leads')
      and s.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'Invalid sync access code' using errcode = '28000';
  end if;
end;
$$;
revoke all on function private.assert_sync_token(text) from public, anon, authenticated;

create or replace function public.mls_sync_get_settings(p_token text)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare r public.mls_sync_settings;
begin
  perform private.assert_sync_token(p_token);
  select * into r from public.mls_sync_settings where id = 1;
  return jsonb_build_object('enabled', r.enabled, 'link', r.link, 'last_run_at', r.last_run_at, 'last_result', r.last_result);
end;
$$;

-- p_enabled / p_link: null = leave unchanged; p_link = '' clears it.
create or replace function public.mls_sync_set_settings(p_token text, p_enabled boolean default null, p_link text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.mls_sync_settings; v_link text; m text[];
begin
  perform private.assert_sync_token(p_token);
  if p_link is not null then
    if btrim(p_link) = '' then
      v_link := '';
    else
      m := regexp_match(btrim(p_link), '^https://smartmls\.connectmls\.com/servlet/QL\?(?:[^#]*&)?D=([A-Za-z0-9]{8,40})(?:&[^#]*)?$');
      if m is null then
        raise exception 'Link must look like https://smartmls.connectmls.com/servlet/QL?D=XXXXXXXX' using errcode = '22023';
      end if;
      v_link := 'https://smartmls.connectmls.com/servlet/QL?D=' || m[1];
    end if;
  end if;
  update public.mls_sync_settings set
    enabled = coalesce(p_enabled, enabled),
    link = case when p_link is null then link when v_link = '' then null else v_link end,
    updated_at = now()
  where id = 1;
  select * into r from public.mls_sync_settings where id = 1;
  return jsonb_build_object('enabled', r.enabled, 'link', r.link, 'last_run_at', r.last_run_at, 'last_result', r.last_result);
end;
$$;

-- The one write path. p_homes = array of mapped homes {id:'mls_<n>', type, address, city, state, zip, beds, baths, price,
-- description, photo_urls[], sqft, year_built, mls_status}. New -> inserted (is_mls, live, paid, active_until = today + mls_expiry days).
-- Existing (not in Trash) -> only price / mls_status / photo_urls refreshed (+ sqft/year_built filled when empty) and last_synced_at
-- touched; admin edits (description, live, active_until, owner...) are never overwritten, Trash is never undone, nothing is removed.
create or replace function public.mls_sync_apply(
  p_token text, p_homes jsonb, p_dry boolean default true, p_source text default 'api',
  p_link_hint text default null, p_skipped int default 0
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t0 timestamptz := clock_timestamp();
  v_on boolean := true; v_days int := 60; v_until date;
  n_in int; n_valid int; n_new int; n_upd int; n_unch int; n_trash int; n_notseen int; n_err int;
  v_id uuid; res jsonb;
begin
  perform private.assert_sync_token(p_token);
  if jsonb_typeof(p_homes) is distinct from 'array' then
    raise exception 'p_homes must be a JSON array' using errcode = '22023';
  end if;
  begin
    select coalesce((value->>'enabled')::boolean, true), coalesce((value->>'days')::int, 60)
      into v_on, v_days from public.app_settings where key = 'mls_expiry';
  exception when others then v_on := true; v_days := 60;
  end;
  v_until := case when v_on then (now() at time zone 'America/New_York')::date + greatest(v_days, 1) else null end;

  create temp table pg_temp.mls_h on commit drop as
  select distinct on (x.id) x.id, x.type, x.address, x.city, x.state, x.zip,
         coalesce(x.beds, 0) beds, coalesce(x.baths, 0) baths, x.price, x.description, x.sqft, x.year_built, x.mls_status,
         coalesce((select array_agg(e order by o) from jsonb_array_elements_text(coalesce(x.photo_urls, '[]'::jsonb)) with ordinality as t(e, o)), '{}'::text[]) as photo_urls
  from jsonb_to_recordset(p_homes) as x(id text, type text, address text, city text, state text, zip text,
         beds numeric, baths numeric, price numeric, description text, photo_urls jsonb, sqft numeric, year_built int, mls_status text)
  where x.id ~ '^mls_[0-9]+$' and x.price is not null and coalesce(btrim(x.address), '') <> ''
  order by x.id;

  n_in := jsonb_array_length(p_homes);
  select count(*) into n_valid from pg_temp.mls_h;
  n_err := n_in - n_valid;

  select count(*) into n_new from pg_temp.mls_h h where not exists (select 1 from public.listings l where l.id = h.id);
  select count(*) into n_trash from pg_temp.mls_h h join public.listings l on l.id = h.id where l.deleted_at is not null;
  select count(*) into n_upd from pg_temp.mls_h h join public.listings l on l.id = h.id
   where l.deleted_at is null and (l.price is distinct from h.price or l.mls_status is distinct from h.mls_status
      or l.photo_urls is distinct from h.photo_urls or (l.sqft is null and h.sqft is not null) or (l.year_built is null and h.year_built is not null));
  n_unch := n_valid - n_new - n_trash - n_upd;
  select count(*) into n_notseen from public.listings l
   where l.is_mls and l.deleted_at is null and l.last_synced_at is not null and not exists (select 1 from pg_temp.mls_h h where h.id = l.id);

  if not coalesce(p_dry, true) then
    insert into public.listings (id, type, address, city, state, zip, beds, baths, price, pets, description, photo_urls,
                                 owner_name, owner_phone, owner_email, paid, live, is_mls, active_until, sqft, year_built,
                                 mls_status, last_synced_at)
    select h.id, case when h.type = 'rent' then 'rent' else 'sale' end, h.address, coalesce(h.city, ''), coalesce(nullif(h.state, ''), 'CT'), coalesce(h.zip, ''),
           h.beds, h.baths, h.price, 'no', coalesce(h.description, ''), h.photo_urls,
           'Marcel Najar', '203-818-3242', 'bureauficoaacredit@gmail.com', true, true, true, v_until,
           h.sqft, h.year_built, h.mls_status, now()
    from pg_temp.mls_h h
    on conflict (id) do nothing;

    update public.listings l set
      price = h.price, mls_status = h.mls_status, photo_urls = h.photo_urls,
      sqft = coalesce(l.sqft, h.sqft), year_built = coalesce(l.year_built, h.year_built), last_synced_at = now()
    from pg_temp.mls_h h
    where l.id = h.id and l.deleted_at is null and (l.price is distinct from h.price or l.mls_status is distinct from h.mls_status
      or l.photo_urls is distinct from h.photo_urls or (l.sqft is null and h.sqft is not null) or (l.year_built is null and h.year_built is not null));

    update public.listings l set last_synced_at = now()
    from pg_temp.mls_h h where l.id = h.id and l.deleted_at is null and l.last_synced_at is distinct from now();
  end if;

  res := jsonb_build_object('dry', coalesce(p_dry, true), 'total', n_in, 'new', n_new, 'updated', n_upd, 'unchanged', n_unch,
                            'notSeen', n_notseen, 'errors', n_err, 'skippedTrashed', n_trash, 'skippedByMapper', p_skipped,
                            'expiresOn', v_until);
  insert into public.mls_import_log (mode, source, link_hint, total_count, new_count, updated_count, unchanged_count, not_seen_count,
                                     skipped_count, error_count, duration_ms)
  values (case when coalesce(p_dry, true) then 'dry' else 'real' end, coalesce(p_source, 'api'), p_link_hint, n_in, n_new, n_upd, n_unch,
          n_notseen, n_trash + p_skipped, n_err, (extract(epoch from clock_timestamp() - t0) * 1000)::int)
  returning id into v_id;
  update public.mls_sync_settings set last_run_at = now(), last_result = res || jsonb_build_object('logId', v_id) where id = 1;
  return res || jsonb_build_object('logId', v_id);
end;
$$;

create or replace function public.mls_import_log_list(p_token text)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
begin
  perform private.assert_sync_token(p_token);
  return coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at desc)
                   from (select * from public.mls_import_log order by created_at desc limit 500) g), '[]'::jsonb);
end;
$$;

create or replace function public.mls_import_log_update(p_token text, p_id uuid, p_label text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.mls_import_log;
begin
  perform private.assert_sync_token(p_token);
  update public.mls_import_log set label = nullif(btrim(p_label), ''), note = nullif(btrim(p_note), '') where id = p_id returning * into r;
  if not found then raise exception 'Log entry not found' using errcode = 'P0002'; end if;
  return to_jsonb(r);
end;
$$;

create or replace function public.mls_import_log_delete(p_token text, p_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.assert_sync_token(p_token);
  delete from public.mls_import_log where id = p_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.mls_import_log_delete_all(p_token text, p_confirm text)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.assert_sync_token(p_token);
  if p_confirm is distinct from 'DELETE' then raise exception 'Type DELETE to confirm' using errcode = '22023'; end if;
  delete from public.mls_import_log where true;
  get diagnostics n = row_count;
  return n;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'mls_sync_get_settings(text)', 'mls_sync_set_settings(text, boolean, text)',
    'mls_sync_apply(text, jsonb, boolean, text, text, int)', 'mls_import_log_list(text)',
    'mls_import_log_update(text, uuid, text, text)', 'mls_import_log_delete(text, uuid)', 'mls_import_log_delete_all(text, text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
