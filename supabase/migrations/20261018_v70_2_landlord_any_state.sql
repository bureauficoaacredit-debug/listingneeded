-- v70.2: landlord reports open to any US town (50 states + DC + PR). Existing rows get state 'CT'; their content is untouched.
alter table public.landlord_reviews add column if not exists state text default 'CT';
update public.landlord_reviews set state = 'CT' where state is null;
alter table public.landlord_reviews drop constraint if exists landlord_reviews_state_chk;
alter table public.landlord_reviews add constraint landlord_reviews_state_chk check (state is null or state ~ '^[A-Z]{2}$');
create index if not exists landlord_reviews_state_town_idx on public.landlord_reviews (state, town);

create or replace function private.us_state_codes()
returns text[] language sql immutable set search_path = '' as $$
  select array['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS',
               'MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
$$;
revoke all on function private.us_state_codes() from public, anon, authenticated;

create or replace function public.submit_landlord_review(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_town text := left(regexp_replace(trim(coalesce(p->>'town', '')), '\s+', ' ', 'g'), 60);
  v_body text := trim(coalesce(p->>'body', ''));
  v_name text := nullif(left(trim(coalesce(p->>'display_name', '')), 40), '');
  v_email text := nullif(left(trim(coalesce(p->>'email', '')), 160), '');
  v_state text := upper(nullif(trim(coalesce(p->>'state', '')), ''));
  v_rating int; v_again boolean;
  v_ip text; v_hash text; v_n int; v_id uuid; v_flags text[];
begin
  -- honeypot: bots fill the hidden "website" field
  if coalesce(p->>'website', '') <> '' then return jsonb_build_object('ok', true); end if;

  if coalesce((p->>'honest')::boolean, false) is not true then
    raise exception 'Please confirm this is your own honest experience as a former tenant.' using errcode = 'P0001';
  end if;
  v_state := coalesce(v_state, 'CT');
  if not v_state = any (private.us_state_codes()) then
    raise exception 'Please pick a state.' using errcode = 'P0001';
  end if;
  if char_length(v_town) < 2 or v_town !~ '^[[:alpha:]][[:alpha:] .''-]*$' then
    raise exception 'Please enter the town or city (letters only).' using errcode = 'P0001';
  end if;
  begin
    v_rating := (p->>'rating')::int;
    v_again := (p->>'would_rent_again')::boolean;
  exception when others then
    raise exception 'Please choose a star rating and Yes or No.' using errcode = 'P0001';
  end;
  if v_rating is null or v_rating not between 1 and 5 then raise exception 'Please choose 1 to 5 stars.' using errcode = 'P0001'; end if;
  if v_again is null then raise exception 'Please answer “Would you rent again?”' using errcode = 'P0001'; end if;
  if char_length(v_body) < 20 then raise exception 'Please write at least 20 characters.' using errcode = 'P0001'; end if;
  if char_length(v_body) > 1000 then raise exception 'Please keep it to 1,000 characters.' using errcode = 'P0001'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email doesn''t look right.' using errcode = 'P0001'; end if;

  -- rate limits: 3 per visitor per hour, 6 per visitor per day, same text once a week, 200 per day overall
  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := '';
  end;
  v_hash := md5('ln-landlord:' || coalesce(nullif(trim(v_ip), ''), 'unknown'));
  select count(*) into v_n from public.landlord_review_private where ip_hash = v_hash and created_at > now() - interval '1 hour';
  if v_n >= 3 then raise exception 'Thanks! You''ve shared several experiences already — please try again later.' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.landlord_review_private where ip_hash = v_hash and created_at > now() - interval '24 hours';
  if v_n >= 6 then raise exception 'Thanks! You''ve shared several experiences already — please try again tomorrow.' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.landlord_reviews where lower(body) = lower(v_body) and created_at > now() - interval '7 days';
  if v_n >= 1 then raise exception 'We already received this experience — thank you.' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.landlord_reviews where created_at > now() - interval '24 hours';
  if v_n >= 200 then raise exception 'Please try again tomorrow.' using errcode = 'P0001'; end if;

  v_flags := private.landlord_review_flags(v_body || ' ' || coalesce(v_name, ''));
  insert into public.landlord_reviews (state, town, rating, would_rent_again, body, display_name, flagged, flag_reasons)
  values (v_state, v_town, v_rating, v_again, v_body, v_name, cardinality(v_flags) > 0, v_flags)
  returning id into v_id;
  insert into public.landlord_review_private (review_id, email, ip_hash) values (v_id, v_email, v_hash);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.submit_landlord_review(jsonb) from public;
grant execute on function public.submit_landlord_review(jsonb) to anon, authenticated;

create or replace function private.notify_landlord_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.landlord_reviews;
  v_key text;
  v_admin text := 'https://www.listingneeded.com/#/admin?tab=landlord';
  v_stars text;
  v_html text; v_text text; e text := '';
  v_reply boolean := coalesce(new.email, '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
begin
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
    if v_key is null or v_key = '' then return new; end if;
    select * into r from public.landlord_reviews where id = new.review_id;
    if r.id is null then return new; end if;
    v_stars := repeat('★', r.rating) || repeat('☆', 5 - r.rating);

    v_html := '<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1d2733">'
      || '<div style="max-width:560px;margin:0 auto;background:#fff;border-top:4px solid #5b2a86;padding:20px 24px">'
      || '<h2 style="margin:0 0 4px;color:#5b2a86">New landlord experience (pending)</h2>'
      || '<p style="margin:0 0 16px;color:#5b6675;font-size:13px">From “Reporting your landlord” on listingneeded.com. Not public until you approve it.</p>'
      || case when r.flagged then '<p style="margin:0 0 12px;padding:8px 10px;background:#fff3cd;color:#7a5600;font-size:13px"><b>Flagged:</b> contains '
           || private.html_escape(array_to_string(r.flag_reasons, ', ')) || '</p>' else '' end
      || '<table style="border-collapse:collapse;font-size:14px;width:100%">'
      || '<tr><td style="padding:6px 0;color:#5b6675;width:130px">Town, state</td><td style="padding:6px 0"><b>' || private.html_escape(r.town || ', ' || coalesce(r.state, 'CT')) || '</b></td></tr>'
      || '<tr><td style="padding:6px 0;color:#5b6675">Rating</td><td style="padding:6px 0;color:#c98a00;font-size:16px">' || v_stars || '</td></tr>'
      || '<tr><td style="padding:6px 0;color:#5b6675">Would rent again</td><td style="padding:6px 0">' || case when r.would_rent_again then 'Yes' else 'No' end || '</td></tr>'
      || '<tr><td style="padding:6px 0;color:#5b6675">Name</td><td style="padding:6px 0">' || coalesce(private.html_escape(r.display_name), '—') || '</td></tr>'
      || '<tr><td style="padding:6px 0;color:#5b6675">Email (private)</td><td style="padding:6px 0">' || coalesce(private.html_escape(nullif(new.email, '')), '—') || '</td></tr>'
      || '<tr><td style="padding:6px 0;color:#5b6675;vertical-align:top">Experience</td><td style="padding:6px 0;white-space:pre-wrap">' || private.html_escape(r.body) || '</td></tr>'
      || '</table>'
      || '<p style="margin:20px 0 0"><a href="' || v_admin || '" style="display:inline-block;background:#5b2a86;color:#fff;text-decoration:none;padding:10px 16px;font-weight:bold">Review in admin · Landlord reviews</a></p>'
      || '<p style="margin:16px 0 0;color:#8a94a3;font-size:12px">Listing Needed · www.listingneeded.com · 203-818-3242</p>'
      || '</div></body></html>';
    v_text := 'New landlord experience (pending)' || E'\n\n'
      || case when r.flagged then 'FLAGGED: contains ' || array_to_string(r.flag_reasons, ', ') || E'\n' else '' end
      || 'Town: ' || r.town || ', ' || coalesce(r.state, 'CT') || E'\n' || 'Rating: ' || r.rating || '/5' || E'\n'
      || 'Would rent again: ' || case when r.would_rent_again then 'Yes' else 'No' end || E'\n'
      || 'Name: ' || coalesce(r.display_name, '—') || E'\n' || 'Email (private): ' || coalesce(nullif(new.email, ''), '—') || E'\n\n'
      || r.body || E'\n\n' || 'Review: ' || v_admin || E'\n';

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', 'Listing Needed <onboarding@resend.dev>',
        'to', jsonb_build_array('bureauficoaacredit@gmail.com'),
        'subject', left('New landlord experience' || case when r.flagged then ' (flagged)' else '' end || ': ' || r.town || ', ' || coalesce(r.state, 'CT') || ' · ' || r.rating || '★', 200),
        'html', v_html, 'text', v_text, 'reply_to', new.email
      ) - case when v_reply then '' else 'reply_to' end,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      timeout_milliseconds := 10000
    );
  exception when others then
    get stacked diagnostics e = message_text;
    raise warning 'landlord review alert email skipped: %', e;  -- never block the insert
  end;
  return new;
end;
$$;
revoke all on function private.notify_landlord_review() from public, anon, authenticated;
