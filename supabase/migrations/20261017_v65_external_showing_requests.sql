-- v65: "Book a showing with a realtor" from the Search page for homes outside Listing Needed (e.g. RentCafe).
-- Same table, RLS, honeypot and rate limits as v54; new nullable column home_ref = the visitor's address or link.
alter table public.showing_requests add column if not exists home_ref text;

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
  v_ext boolean := false;
  v_ref text;
begin
  -- honeypot: bots fill the hidden "website" field
  if coalesce(p->>'website', '') <> '' then
    return jsonb_build_object('ok', true);
  end if;

  -- v65: listing_id 'external' = a home found elsewhere (e.g. RentCafe), booked from the Search page; the visitor
  -- types its address or link (home_ref)
  v_ext := coalesce(p->>'listing_id', '') = 'external';
  if v_ext then
    v_ref := left(trim(coalesce(p->>'home_ref', '')), 500);
    if length(v_ref) < 5 then raise exception 'Please enter the address or link of the home.' using errcode = 'P0001'; end if;
  else
    select * into l from public.listings where id = p->>'listing_id' and deleted_at is null;
    if l.id is null then raise exception 'This home is no longer available.' using errcode = 'P0001'; end if;
  end if;

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
   where listing_id = case when v_ext then 'external' else l.id end
     and (not v_ext or home_ref = v_ref)
     and regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
     and created_at > now() - interval '24 hours';
  if v_n >= 3 then raise exception 'We already have your request for this home — we''ll be in touch. Questions: 203-818-3242.' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.showing_requests where created_at > now() - interval '24 hours';
  if v_n >= 300 then raise exception 'Please call or text 203-818-3242 to schedule.' using errcode = 'P0001'; end if;

  insert into public.showing_requests (listing_id, address, mls_number, preferred_date, preferred_time, alt_date, alt_time,
                                       name, phone, email, message, ip_hash, home_ref)
  values (case when v_ext then 'external' else l.id end,
          case when v_ext then left(v_ref, 300)
               else left(concat_ws(', ', nullif(l.address, ''), nullif(l.city, ''), nullif(trim(concat_ws(' ', l.state, l.zip)), '')), 300) end,
          case when not v_ext and l.id like 'mls\_%' then substr(l.id, 5) else null end,
          v_date, left(trim(p->>'preferred_time'), 40), v_alt, nullif(left(trim(coalesce(p->>'alt_time', '')), 40), ''),
          v_name, v_phone, v_email, nullif(left(trim(coalesce(p->>'message', '')), 2000), ''), v_hash, v_ref)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.request_showing(jsonb) from public;
grant execute on function public.request_showing(jsonb) to anon, authenticated;

-- alert email: link to the visitor's link (or Search) and label external requests
CREATE OR REPLACE FUNCTION private.notify_showing_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key text;
  -- v65: requests from the Search page are for homes outside Listing Needed (listing_id 'external'); the visitor's
  -- address or link is in home_ref
  v_ext boolean := new.listing_id = 'external';
  v_home text := case when new.listing_id = 'external'
                      then case when coalesce(new.home_ref, '') ~* '^https?://[^\s"<>]+$' then new.home_ref else 'https://www.listingneeded.com/#/browse' end
                      else 'https://www.listingneeded.com/#/listing/' || new.listing_id end;
  v_admin text := 'https://www.listingneeded.com/#/admin?tab=showings';
  v_st text := 'https://login.showingtime.com/ui/login';
  v_form text := 'https://pr.transactiondesk.com/forms/809a0000-0000-0000-0000-000000000000';
  v_first text;
  v_second text;
  v_tel text := regexp_replace(coalesce(new.phone, ''), '[^0-9+]', '', 'g');
  v_html text;
  v_text text;
  e text := '';
begin
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
    if v_key is null or v_key = '' then
      return new;
    end if;

    v_first := to_char(new.preferred_date, 'Dy, Mon FMDD, YYYY') || ' · ' || coalesce(new.preferred_time, '');
    v_second := case when new.alt_date is not null or coalesce(new.alt_time, '') <> ''
                     then concat_ws(' · ', to_char(new.alt_date, 'Dy, Mon FMDD, YYYY'), nullif(new.alt_time, ''))
                     else null end;

    v_html := '<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1d2733">'
      || '<div style="max-width:560px;margin:0 auto;background:#fff;border-top:4px solid #0B3A6E;padding:20px 24px">'
      || '<h2 style="margin:0 0 4px;color:#0B3A6E">New showing request</h2>'
      || '<p style="margin:0 0 16px;color:#5b6675;font-size:13px">From “Book a showing with a realtor” on listingneeded.com</p>'
      || '<p style="margin:0 0 4px;font-size:16px"><a href="' || private.html_escape(v_home) || '" style="color:#0B3A6E;font-weight:bold">'
      || private.html_escape(new.address) || '</a></p>'
      || '<p style="margin:0 0 16px;color:#5b6675;font-size:13px">'
      || case when new.mls_number is not null then 'MLS # ' || private.html_escape(new.mls_number)
              when v_ext then 'Home found elsewhere (e.g. RentCafe), from the Search page' else 'DIY / owner listing' end || '</p>'
      || '<table style="border-collapse:collapse;font-size:14px;width:100%">'
      || '<tr><td style="padding:6px 0;color:#5b6675;width:110px">1st choice</td><td style="padding:6px 0"><b>' || private.html_escape(v_first) || '</b></td></tr>'
      || case when v_second is not null then '<tr><td style="padding:6px 0;color:#5b6675">2nd choice</td><td style="padding:6px 0">' || private.html_escape(v_second) || '</td></tr>' else '' end
      || '<tr><td style="padding:6px 0;color:#5b6675">Name</td><td style="padding:6px 0">' || private.html_escape(new.name) || '</td></tr>'
      || '<tr><td style="padding:6px 0;color:#5b6675">Phone</td><td style="padding:6px 0"><a href="tel:' || private.html_escape(v_tel) || '">' || private.html_escape(new.phone) || '</a></td></tr>'
      || '<tr><td style="padding:6px 0;color:#5b6675">Email</td><td style="padding:6px 0">'
      || case when coalesce(new.email, '') <> '' then '<a href="mailto:' || private.html_escape(new.email) || '">' || private.html_escape(new.email) || '</a>' else '—' end || '</td></tr>'
      || '<tr><td style="padding:6px 0;color:#5b6675;vertical-align:top">Message</td><td style="padding:6px 0;white-space:pre-wrap">'
      || case when coalesce(new.message, '') <> '' then private.html_escape(new.message) else '—' end || '</td></tr>'
      || '</table>'
      || '<div style="margin:22px 0 0">'
      || '<a href="' || v_st || '" style="display:inline-block;background:#7f171c;color:#fff;text-decoration:none;padding:12px 18px;font-weight:bold;font-size:15px;margin:0 8px 8px 0">Open ShowingTime</a>'
      || '<a href="' || v_form || '" style="display:inline-block;background:#1f6b36;color:#fff;text-decoration:none;padding:12px 18px;font-weight:bold;font-size:15px;margin:0 12px 8px 0">Open MLS form</a>'
      || '<span style="display:inline-block;vertical-align:middle;font-size:15px;color:#1d2733;margin:0 0 8px">'
      || case when new.mls_number is not null then 'MLS # <b style="font-size:17px;letter-spacing:.02em">' || private.html_escape(new.mls_number) || '</b>'
              else '<span style="color:#5b6675">No MLS # (owner listing)</span>' end
      || '</span></div>'
      || '<p style="margin:4px 0 0"><a href="' || private.html_escape(v_admin) || '" style="display:inline-block;background:#0B3A6E;color:#fff;text-decoration:none;padding:10px 16px;font-weight:bold">Open admin · Showing requests</a></p>'
      || '<p style="margin:16px 0 0;color:#8a94a3;font-size:12px">Listing Needed · www.listingneeded.com · 203-818-3242</p>'
      || '</div></body></html>';

    v_text := 'New showing request' || E'\n\n'
      || coalesce(new.address, '') || E'\n' || v_home || E'\n'
      || case when new.mls_number is not null then 'MLS # ' || new.mls_number
              when v_ext then 'Home found elsewhere (e.g. RentCafe), from the Search page' else 'DIY / owner listing' end || E'\n\n'
      || '1st choice: ' || v_first || E'\n'
      || case when v_second is not null then '2nd choice: ' || v_second || E'\n' else '' end
      || 'Name: ' || coalesce(new.name, '') || E'\n'
      || 'Phone: ' || coalesce(new.phone, '') || E'\n'
      || 'Email: ' || coalesce(nullif(new.email, ''), '—') || E'\n'
      || 'Message: ' || coalesce(nullif(new.message, ''), '—') || E'\n\n'
      || 'Open ShowingTime: ' || v_st || '  (' || case when new.mls_number is not null then 'MLS # ' || new.mls_number else 'No MLS # (owner listing)' end || ')' || E'\n'
      || 'Open MLS form: ' || v_form || E'\n'
      || 'Admin: ' || v_admin || E'\n';

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', 'Listing Needed <onboarding@resend.dev>',
        'to', jsonb_build_array('bureauficoaacredit@gmail.com'),
        'subject', left('New showing request: ' || regexp_replace(coalesce(new.address, new.listing_id), '[\r\n]+', ' ', 'g'), 200),
        'html', v_html,
        'text', v_text,
        'reply_to', case when coalesce(new.email, '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then new.email else null end
      ) - case when coalesce(new.email, '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then '' else 'reply_to' end,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      timeout_milliseconds := 10000
    );
  exception when others then
    get stacked diagnostics e = message_text;
    raise warning 'showing alert email skipped: %', e;  -- never block the insert
  end;
  return new;
end;
$function$;
