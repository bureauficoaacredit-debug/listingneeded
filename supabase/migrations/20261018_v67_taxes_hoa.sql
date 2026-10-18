-- v67: annual taxes + HOA / common charges on listings (MLS listing details + optional DIY/admin entry)
alter table public.listings
  add column if not exists taxes_annual numeric,
  add column if not exists tax_year int,
  add column if not exists hoa_fee numeric,
  add column if not exists hoa_frequency text,
  add column if not exists details_synced_at timestamptz;

alter table public.listings drop constraint if exists listings_taxes_hoa_chk;
alter table public.listings add constraint listings_taxes_hoa_chk check (
  (taxes_annual is null or (taxes_annual >= 0 and taxes_annual < 10000000))
  and (tax_year is null or tax_year between 1990 and 2100)
  and (hoa_fee is null or (hoa_fee >= 0 and hoa_fee < 1000000))
  and (hoa_frequency is null or hoa_frequency in ('month', 'quarter', 'half-year', 'year', 'week'))
) not valid;

-- Which of these MLS homes need their details (taxes/HOA) fetched: never fetched first, then older than 7 days.
create or replace function public.mls_sync_details_todo(p_token text, p_ids text[], p_limit int default 150)
returns text[] language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_sync_token(p_token);
  return coalesce((
    select array_agg(id) from (
      select l.id from public.listings l
       where l.id = any(p_ids) and l.is_mls and l.deleted_at is null
         and (l.details_synced_at is null or l.details_synced_at < now() - interval '7 days')
       order by l.details_synced_at nulls first, l.id
       limit least(greatest(coalesce(p_limit, 150), 1), 1500)
    ) s), '{}'::text[]);
end;
$$;

-- Save fetched details. A value the MLS leaves empty keeps what is already there (never blanks a known amount).
create or replace function public.mls_sync_apply_details(p_token text, p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.assert_sync_token(p_token);
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'p_rows must be a JSON array' using errcode = '22023'; end if;
  update public.listings l set
    taxes_annual = coalesce(case when x.taxes_annual >= 0 and x.taxes_annual < 10000000 then x.taxes_annual end, l.taxes_annual),
    tax_year = case when x.taxes_annual is not null and x.tax_year between 1990 and 2100 then x.tax_year else l.tax_year end,
    hoa_fee = coalesce(case when x.hoa_fee >= 0 and x.hoa_fee < 1000000 then x.hoa_fee end, l.hoa_fee),
    hoa_frequency = case when x.hoa_fee is not null and x.hoa_frequency in ('month', 'quarter', 'half-year', 'year', 'week') then x.hoa_frequency
                         when x.hoa_fee is not null then null else l.hoa_frequency end,
    details_synced_at = now()
  from jsonb_to_recordset(p_rows) as x(id text, taxes_annual numeric, tax_year int, hoa_fee numeric, hoa_frequency text)
  where l.id = x.id and l.is_mls and l.deleted_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.mls_sync_details_todo(text, text[], int) from public;
revoke all on function public.mls_sync_apply_details(text, jsonb) from public;
grant execute on function public.mls_sync_details_todo(text, text[], int) to anon, authenticated;
grant execute on function public.mls_sync_apply_details(text, jsonb) to anon, authenticated;
