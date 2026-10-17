-- v58: showing-request alert email adds a green "Open MLS form" button
-- (https://pr.transactiondesk.com/forms/809a0000-0000-0000-0000-000000000000) next to "Open ShowingTime"; also in plain text.
-- Same v56 trigger; only the function body changes. No secrets (Resend key stays in Vault 'resend_api_key').
create or replace function private.notify_showing_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_home text := 'https://www.listingneeded.com/#/listing/' || new.listing_id;
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
      || case when new.mls_number is not null then 'MLS # ' || private.html_escape(new.mls_number) else 'DIY / owner listing' end || '</p>'
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
      || case when new.mls_number is not null then 'MLS # ' || new.mls_number else 'DIY / owner listing' end || E'\n\n'
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
$$;
revoke all on function private.notify_showing_request() from public, anon, authenticated;
