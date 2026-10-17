-- v54: "Schedule a showing" requests from home detail pages (MLS + DIY).
-- Public may only CREATE a request, and only through request_showing() (validated, honeypot, rate limited);
-- only the admin (public.is_admin()) can read / update / delete via RLS.
create table if not exists public.showing_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  listing_id text not null,
  address text not null default '',
  mls_number text,
  preferred_date date not null,
  preferred_time text not null,
  alt_date date,
  alt_time text,
  name text not null,
  phone text not null,
  email text,
  message text,
  status text not null default 'new' check (status in ('new', 'confirmed', 'done')),
  admin_notes text,
  ip_hash text
);
create index if not exists showing_requests_created_idx on public.showing_requests (created_at desc);
create index if not exists showing_requests_ip_idx on public.showing_requests (ip_hash, created_at desc);

alter table public.showing_requests enable row level security;
revoke all on public.showing_requests from anon;
grant select, update, delete on public.showing_requests to authenticated;

drop policy if exists "showing_requests admin read" on public.showing_requests;
create policy "showing_requests admin read" on public.showing_requests for select to authenticated using (public.is_admin());
drop policy if exists "showing_requests admin update" on public.showing_requests;
create policy "showing_requests admin update" on public.showing_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "showing_requests admin delete" on public.showing_requests;
create policy "showing_requests admin delete" on public.showing_requests for delete to authenticated using (public.is_admin());
-- no insert policy: inserts happen only inside request_showing() (security definer)

create or replace function public.request_showing(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.listings;
  v_ip text; v_hash text; v_n int;
  v_date date; v_alt date; v_today date := (now() at time zone 'America/New_York')::date;
  v_phone text := left(trim(coalesce(p->>'phone', '')), 40);
  v_email text := nullif(left(trim(coalesce(p->>'email', '')), 160), '');
  v_name text := left(trim(coalesce(p->>'name', '')), 120);
  v_id uuid;
begin
  -- honeypot: bots fill the hidden "website" field
  if coalesce(p->>'website', '') <> '' then
    return jsonb_build_object('ok', true);
  end if;

  select * into l from public.listings where id = p->>'listing_id' and deleted_at is null;
  if l.id is null then raise exception 'This home is no longer available.' using errcode = 'P0001'; end if;

  if length(v_name) < 2 then raise exception 'Please enter your name.' using errcode = 'P0001'; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then raise exception 'Please enter a phone number we can call or text.' using errcode = 'P0001'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email doesn''t look right.' using errcode = 'P0001'; end if;
  begin
    v_date := (p->>'preferred_date')::date;
    v_alt := nullif(p->>'alt_date', '')::date;
  exception when others then
    raise exception 'Please pick a valid date.' using errcode = 'P0001';
  end;
  if v_date is null or v_date < v_today or v_date > v_today + 180 then raise exception 'Please pick a date within the next 6 months.' using errcode = 'P0001'; end if;
  if v_alt is not null and (v_alt < v_today or v_alt > v_today + 180) then raise exception 'Please pick a valid second-choice date.' using errcode = 'P0001'; end if;
  if length(coalesce(trim(p->>'preferred_time'), '')) < 1 then raise exception 'Please pick a time.' using errcode = 'P0001'; end if;

  -- rate limits: 5 per visitor per hour, 3 per phone per home per day, 300 per day overall
  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := '';
  end;
  v_hash := md5('ln-showing:' || coalesce(nullif(trim(v_ip), ''), 'unknown'));
  select count(*) into v_n from public.showing_requests where ip_hash = v_hash and created_at > now() - interval '1 hour';
  if v_n >= 5 then raise exception 'Too many requests — please call or text 203-818-3242.' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.showing_requests
   where listing_id = l.id and regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
     and created_at > now() - interval '24 hours';
  if v_n >= 3 then raise exception 'We already have your request for this home — we''ll be in touch. Questions: 203-818-3242.' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.showing_requests where created_at > now() - interval '24 hours';
  if v_n >= 300 then raise exception 'Please call or text 203-818-3242 to schedule.' using errcode = 'P0001'; end if;

  insert into public.showing_requests (listing_id, address, mls_number, preferred_date, preferred_time, alt_date, alt_time,
                                       name, phone, email, message, ip_hash)
  values (l.id,
          left(concat_ws(', ', nullif(l.address, ''), nullif(l.city, ''), nullif(trim(concat_ws(' ', l.state, l.zip)), '')), 300),
          case when l.id like 'mls\_%' then substr(l.id, 5) else null end,
          v_date, left(trim(p->>'preferred_time'), 40), v_alt, nullif(left(trim(coalesce(p->>'alt_time', '')), 40), ''),
          v_name, v_phone, v_email, nullif(left(trim(coalesce(p->>'message', '')), 2000), ''), v_hash)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.request_showing(jsonb) from public;
grant execute on function public.request_showing(jsonb) to anon, authenticated;
