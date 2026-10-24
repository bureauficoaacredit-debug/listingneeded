-- v77: short sales. short_sale is what the site shows; it is worked out by a trigger:
--   admin choice (short_sale_admin, null = automatic)  >  MLS details POTENTIALSHORTSALE (short_sale_mls)  or  description keywords.
alter table public.listings
  add column if not exists short_sale boolean not null default false,
  add column if not exists short_sale_mls boolean,
  add column if not exists short_sale_admin boolean;

create or replace function private.short_sale_text(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p, '') ~* 'short[ -]?sale'
      or coalesce(p, '') ~* '(lien[ -]?holder|third[ -]party|3rd[ -]party|lender|bank)(''?s)?(/lender)?[ '']{0,3}approval(?! and financing)'
$$;

create or replace function private.listings_short_sale_tg() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.short_sale := coalesce(new.short_sale_admin, coalesce(new.short_sale_mls, false) or private.short_sale_text(new.description));
  return new;
end;
$$;

drop trigger if exists listings_short_sale on public.listings;
create trigger listings_short_sale before insert or update of description, short_sale_mls, short_sale_admin, short_sale
  on public.listings for each row execute function private.listings_short_sale_tg();

create index if not exists listings_short_sale_idx on public.listings (short_sale) where short_sale;

-- Details step of the hourly sync now also sends short_sale (true / false / null = MLS left it blank).
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
    short_sale_mls = case when x.short_sale is not null then x.short_sale else l.short_sale_mls end,
    details_synced_at = now()
  from jsonb_to_recordset(p_rows) as x(id text, taxes_annual numeric, tax_year int, hoa_fee numeric, hoa_frequency text, short_sale boolean)
  where l.id = x.id and l.is_mls and l.deleted_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.mls_sync_apply_details(text, jsonb) from public;
grant execute on function public.mls_sync_apply_details(text, jsonb) to anon, authenticated;

-- Backfill from descriptions (MLS field is filled by the details step / one-off backfill).
update public.listings set short_sale = short_sale where deleted_at is null;
