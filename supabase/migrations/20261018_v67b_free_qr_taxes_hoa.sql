-- v67: free QR listings also keep the optional taxes / HOA fields
CREATE OR REPLACE FUNCTION public.create_free_qr_listing(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg jsonb; v_days int; v_cap int; v_today int; v_id text; r public.listings;
  v_type text := p->>'type'; v_price numeric;
begin
  select value->'free' into cfg from public.app_settings where key = 'qr_codes';
  if cfg is null or coalesce((cfg->>'enabled')::boolean, false) = false or coalesce((cfg->>'hidden')::boolean, false) then
    raise exception 'The free listing QR code is not active right now.' using errcode = 'P0001';
  end if;
  v_cap := greatest(1, least(coalesce((cfg->>'daily_cap')::int, 25), 1000));
  select count(*) into v_today from public.listings
   where source = 'free-qr' and created_at > now() - interval '24 hours';
  if v_today >= v_cap then
    raise exception 'Too many free listings today. Please try again tomorrow or call 203-818-3242.' using errcode = 'P0001';
  end if;

  if v_type not in ('rent', 'sale') then raise exception 'Choose For rent or For sale.'; end if;
  v_price := nullif(p->>'price', '')::numeric;
  if v_price is null or v_price <= 0 or v_price > 100000000 then raise exception 'Enter a valid price.'; end if;
  if length(coalesce(trim(p->>'address'), '')) < 3 or length(p->>'address') > 200 then raise exception 'Enter the address.'; end if;
  if length(coalesce(trim(p->>'owner_phone'), '')) < 7 or position('@' in coalesce(p->>'owner_email', '')) < 2 then
    raise exception 'Phone and email are required.';
  end if;

  select coalesce((value->>'days')::int, 90) into v_days from public.app_settings where key = 'paid_term';
  v_days := greatest(1, least(coalesce(v_days, 90), 3650));
  v_id := 'ln_' || to_char(clock_timestamp(), 'YYMMDDHH24MISS') || '_' || substr(md5(random()::text), 1, 6);

  insert into public.listings (id, type, address, city, state, zip, beds, baths, price, pets, description, photo_urls,
                               owner_name, owner_phone, owner_email, sqft, year_built,
                               taxes_annual, tax_year, hoa_fee, hoa_frequency,
                               paid, live, is_mls, active_until, source)
  values (v_id, v_type, left(trim(p->>'address'), 200), left(trim(coalesce(p->>'city', '')), 80),
          left(coalesce(nullif(trim(p->>'state'), ''), 'CT'), 20), left(trim(coalesce(p->>'zip', '')), 10),
          greatest(0, least(coalesce(nullif(p->>'beds', '')::numeric, 0), 50)),
          greatest(0, least(coalesce(nullif(p->>'baths', '')::numeric, 0), 50)),
          v_price, case when p->>'pets' in ('yes', 'no', 'negotiable') then p->>'pets' else 'no' end,
          left(coalesce(p->>'description', ''), 5000),
          coalesce((select array_agg(u) from (select jsonb_array_elements_text(coalesce(p->'photo_urls', '[]'::jsonb)) u limit 12) x
                    where u like 'https://yqcpsuzxuputmucemswi.supabase.co/storage/v1/object/public/listing-photos/%'), '{}'),
          left(trim(coalesce(p->>'owner_name', '')), 120), left(trim(p->>'owner_phone'), 40), left(trim(p->>'owner_email'), 160),
          nullif(p->>'sqft', '')::numeric, nullif(p->>'year_built', '')::int,
          -- v67: optional taxes / HOA typed by the owner (bad values are dropped, never guessed)
          case when nullif(p->>'taxes_annual', '') ~ '^[0-9]+(\.[0-9]+)?$' and (p->>'taxes_annual')::numeric < 10000000 then (p->>'taxes_annual')::numeric end,
          case when nullif(p->>'taxes_annual', '') is not null and nullif(p->>'tax_year', '') ~ '^[0-9]{4}$' and (p->>'tax_year')::int between 1990 and 2100 then (p->>'tax_year')::int end,
          case when nullif(p->>'hoa_fee', '') ~ '^[0-9]+(\.[0-9]+)?$' and (p->>'hoa_fee')::numeric < 1000000 then (p->>'hoa_fee')::numeric end,
          case when nullif(p->>'hoa_fee', '') is not null and p->>'hoa_frequency' in ('month', 'quarter', 'half-year', 'year', 'week') then p->>'hoa_frequency' end,
          true, true, false, (now() at time zone 'America/New_York')::date + v_days, 'free-qr')
  returning * into r;
  return to_jsonb(r);
end;
$function$;
