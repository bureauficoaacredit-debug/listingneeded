-- v68: property type for the header menu's "Apartments / Condos / Houses for rent" links.
-- Computed column (no stored data): MLS rows read the subtype from the description header
-- ("... · Residential Rental · Condominium Rental · ..."), DIY rows from their own words.
create or replace function public.ptype(l public.listings)
returns text language sql stable set search_path = '' as $$
  select case
    when h ~* 'condominium|co-op|condo|townho' then 'condo'
    when h ~* 'multi-family|apartment|\mapt\M|duplex|2-family|two-family|3-family' then 'apartment'
    when h ~* 'single family|house|colonial|cape|ranch|cottage' then 'house'
    else null end
  from (select case when coalesce(l.is_mls, false) then split_part(coalesce(l.description, ''), ' — ', 1)
                    else left(coalesce(l.description, ''), 600) end as h) s
$$;
grant execute on function public.ptype(public.listings) to anon, authenticated;
