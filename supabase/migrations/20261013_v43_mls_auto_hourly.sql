-- v43: server-side hourly MLS import (pg_cron + pg_net -> POST /api/mls-sync). No agent, no email.
-- The cron job authenticates with its OWN sync token, generated inside the database, kept only in Supabase Vault
-- (secret 'mls_sync_cron_token'); its SHA-256 sits in private.admin_secrets as 'mls_sync_cron'. The token never
-- appears in this file, in git, or in any output. Rotate: re-run the "rotate" block at the bottom.
create extension if not exists pg_net;

create or replace function private.assert_sync_token(p_token text)
returns void language plpgsql security definer set search_path = '' stable as $$
begin
  if p_token is null or length(p_token) < 16 or not exists (
    select 1 from private.admin_secrets s
    where s.name in ('mls_sync', 'mls_sync_cron', 'cma_leads')
      and s.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'Invalid sync access code' using errcode = '28000';
  end if;
end;
$$;
revoke all on function private.assert_sync_token(text) from public, anon, authenticated;

-- failed runs (expired link, portal down, ...) become an error row in the admin import log
create or replace function public.mls_sync_log_error(p_token text, p_source text, p_dry boolean, p_message text, p_link_hint text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_res jsonb;
begin
  perform private.assert_sync_token(p_token);
  insert into public.mls_import_log (mode, source, link_hint, error_count, errors)
  values (case when coalesce(p_dry, false) then 'dry' else 'real' end, coalesce(p_source, 'api'), p_link_hint, 1,
          jsonb_build_object('message', left(coalesce(p_message, 'unknown error'), 500)))
  returning id into v_id;
  v_res := jsonb_build_object('dry', coalesce(p_dry, false), 'error', left(coalesce(p_message, ''), 500), 'logId', v_id, 'new', 0, 'updated', 0);
  update public.mls_sync_settings set last_run_at = now(), last_result = v_res where id = 1;
  return v_id;
end;
$$;
revoke all on function public.mls_sync_log_error(text, text, boolean, text, text) from public;
grant execute on function public.mls_sync_log_error(text, text, boolean, text, text) to anon, authenticated;

-- generate the cron token inside the database (once) -> Vault + hash
do $$
declare t text;
begin
  if not exists (select 1 from vault.secrets where name = 'mls_sync_cron_token') then
    t := upper(encode(extensions.gen_random_bytes(24), 'hex'));
    perform vault.create_secret(t, 'mls_sync_cron_token', 'Listing Needed: bearer token for the hourly /api/mls-sync cron job');
    insert into private.admin_secrets (name, token_sha256) values ('mls_sync_cron', encode(sha256(convert_to(t, 'UTF8')), 'hex'))
    on conflict (name) do update set token_sha256 = excluded.token_sha256;
  end if;
end $$;

-- the job: every hour at minute 23 (UTC clock; minute is the same in every zone)
create or replace function private.mls_sync_cron_call()
returns bigint language plpgsql security definer set search_path = '' as $$
declare t text; rid bigint;
begin
  select decrypted_secret into t from vault.decrypted_secrets where name = 'mls_sync_cron_token';
  if t is null then raise exception 'mls_sync_cron_token missing from Vault'; end if;
  select net.http_post(
    url := 'https://www.listingneeded.com/api/mls-sync?source=auto-hourly',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || t),
    timeout_milliseconds := 60000
  ) into rid;
  return rid;
end;
$$;
revoke all on function private.mls_sync_cron_call() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'mls-sync-hourly';
select cron.schedule('mls-sync-hourly', '23 * * * *', $$select private.mls_sync_cron_call()$$);

-- rotate (manual):
-- update vault.secrets set secret = ... ; or: delete the vault secret + admin_secrets row 'mls_sync_cron' and re-run the do-block above.
