-- v76: map search. Coordinates for each home (US Census Geocoder, ZIP centroid fallback), filled by the site's own server.
alter table public.listings
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geo_source text,          -- 'address' | 'zip' | 'none'
  add column if not exists geocoded_at timestamptz,
  add column if not exists geo_key text;             -- address used, so an edited address is geocoded again
alter table public.listings drop constraint if exists listings_latlng_ok;
alter table public.listings add constraint listings_latlng_ok check (
  (lat is null and lng is null) or (lat between -90 and 90 and lng between -180 and 180));
create index if not exists listings_geo_todo_idx on public.listings (geocoded_at nulls first) where deleted_at is null;

-- Homes that still need coordinates (new, address changed, or a failed try older than 7 days).
create or replace function public.geocode_todo(p_token text, p_limit int default 500)
returns table(id text, address text, city text, state text, zip text) language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sync_token(p_token);
  return query
    select l.id, l.address, l.city, l.state, l.zip from public.listings l
     where l.deleted_at is null
       and (l.geocoded_at is null
            or l.geo_key is distinct from concat_ws('|', l.address, l.city, l.state, l.zip)
            or (l.geo_source = 'none' and l.geocoded_at < now() - interval '7 days'))
     order by l.geocoded_at nulls first, l.created_at desc
     limit least(greatest(coalesce(p_limit, 500), 1), 5000);
end;
$$;

create or replace function public.geocode_apply(p_token text, p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.assert_sync_token(p_token);
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'p_rows must be a JSON array' using errcode = '22023'; end if;
  update public.listings l set
    lat = case when x.src in ('address','zip') and x.lat between -90 and 90 and x.lng between -180 and 180 then x.lat else l.lat end,
    lng = case when x.src in ('address','zip') and x.lat between -90 and 90 and x.lng between -180 and 180 then x.lng else l.lng end,
    geo_source = case when x.src in ('address','zip','none') then x.src else 'none' end,
    geo_key = concat_ws('|', l.address, l.city, l.state, l.zip),
    geocoded_at = now()
  from jsonb_to_recordset(p_rows) as x(id text, lat double precision, lng double precision, src text)
  where l.id = x.id and l.deleted_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.geocode_todo(text, int) from public;
revoke all on function public.geocode_apply(text, jsonb) from public;
grant execute on function public.geocode_todo(text, int) to anon, authenticated;
grant execute on function public.geocode_apply(text, jsonb) to anon, authenticated;
