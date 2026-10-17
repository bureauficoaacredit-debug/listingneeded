-- Disaster-recovery export (read-only, token-gated). The nightly GitHub Actions backup calls these with the
-- backup token (only its SHA-256 is stored here; the value lives in GitHub Actions secrets). Secret values
-- (admin_secrets hashes, Vault, auth password hashes, MLS link URLs) are never returned.
-- The 'backup' row in private.admin_secrets (SHA-256 of the token) is inserted out-of-band, not in this file.

create or replace function private.assert_backup_token(p_token text)
returns void language plpgsql security definer set search_path = '' stable as $$
begin
  if public.is_admin() then return; end if;
  if p_token is null or length(p_token) < 16 or not exists (
    select 1 from private.admin_secrets s
    where s.name = 'backup' and s.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'Invalid backup token' using errcode = '28000';
  end if;
end; $$;
revoke all on function private.assert_backup_token(text) from public, anon, authenticated;

create or replace function public.backup_table(p_token text, p_table text, p_offset int default 0, p_limit int default 1000)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare res jsonb; lim int := greatest(1, least(coalesce(p_limit, 1000), 2000)); off int := greatest(0, coalesce(p_offset, 0));
begin
  perform private.assert_backup_token(p_token);
  if p_table = 'listings' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') into res from (select * from public.listings order by id offset off limit lim) t;
  elsif p_table = 'partner_links' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') into res from (select * from public.partner_links order by id offset off limit lim) t;
  elsif p_table = 'app_settings' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.key), '[]') into res from (select * from public.app_settings order by key offset off limit lim) t;
  elsif p_table = 'cma_leads' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') into res from (select * from public.cma_leads order by created_at, id offset off limit lim) t;
  elsif p_table = 'mls_import_log' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') into res from (select * from public.mls_import_log order by created_at, id offset off limit lim) t;
  elsif p_table = 'mls_sync_settings' then
    select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('link', case when t.link is null then null else '<SECRET: MLS email link, see SECRETS-CHECKLIST.md>' end) order by t.id), '[]')
      into res from (select * from public.mls_sync_settings order by id offset off limit lim) t;
  elsif p_table = 'mls_sync_links' then
    select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('url', '<SECRET: ' || t.kind || ' link "' || t.label || '", see SECRETS-CHECKLIST.md>') order by t.created_at), '[]')
      into res from (select * from public.mls_sync_links order by created_at offset off limit lim) t;
  else
    raise exception 'Unknown table %', p_table;
  end if;
  return res;
end; $$;

create or replace function public.backup_schema(p_token text)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare res jsonb;
begin
  perform private.assert_backup_token(p_token);
  select jsonb_build_object(
    'generated_at', now(),
    'postgres_version', current_setting('server_version'),
    'extensions', (select jsonb_agg(jsonb_build_object('name', e.extname, 'version', e.extversion, 'schema', n.nspname) order by e.extname)
                   from pg_extension e join pg_namespace n on n.oid = e.extnamespace),
    'tables', (select jsonb_agg(jsonb_build_object(
        'schema', n.nspname, 'name', c.relname, 'rls', c.relrowsecurity,
        'columns', (select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
                       'udt', t.typname, 'not_null', a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid),
                       'generated', a.attgenerated <> '') order by a.attnum)
                    from pg_attribute a join pg_type t on t.oid = a.atttypid
                    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
        'constraints', (select jsonb_agg(jsonb_build_object('name', k.conname, 'type', k.contype, 'def', pg_get_constraintdef(k.oid)) order by k.contype desc, k.conname)
                        from pg_constraint k where k.conrelid = c.oid),
        'indexes', (select jsonb_agg(i.indexdef order by i.indexname) from pg_indexes i
                    where i.schemaname = n.nspname and i.tablename = c.relname
                      and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.conname = i.indexname)),
        'grants', (select jsonb_agg(jsonb_build_object('grantee', g.grantee, 'privilege', g.privilege_type) order by g.grantee, g.privilege_type)
                   from information_schema.role_table_grants g where g.table_schema = n.nspname and g.table_name = c.relname
                     and g.grantee in ('anon', 'authenticated', 'service_role'))
      ) order by n.nspname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public', 'private')),
    'policies', (select jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename, 'name', policyname, 'permissive', permissive,
                   'roles', roles, 'cmd', cmd, 'using', qual, 'check', with_check) order by schemaname, tablename, policyname)
                 from pg_policies where schemaname in ('public', 'private', 'storage')),
    'functions', (select jsonb_agg(jsonb_build_object('schema', n.nspname, 'name', p.proname,
                    'args', pg_get_function_identity_arguments(p.oid), 'def', pg_get_functiondef(p.oid),
                    'acl', coalesce(p.proacl::text, '')) order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname in ('public', 'private') and p.prokind = 'f'
                    and not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')),
    'triggers', (select jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname, 'name', tg.tgname, 'def', pg_get_triggerdef(tg.oid)) order by n.nspname, c.relname, tg.tgname)
                 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
                 where not tg.tgisinternal and n.nspname in ('public', 'private', 'auth')),
    'cron_jobs', (select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'command', j.command, 'active', j.active) order by j.jobname) from cron.job j),
    'vault_secret_names', (select jsonb_agg(s.name order by s.name) from vault.secrets s),
    'admin_secret_names', (select jsonb_agg(s.name order by s.name) from private.admin_secrets s),
    'admin_emails', (select jsonb_agg(a.email) from private.admins a),
    'auth_users', (select jsonb_agg(jsonb_build_object('email', u.email, 'created_at', u.created_at, 'app_metadata', u.raw_app_meta_data)) from auth.users u),
    'buckets', (select jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public, 'file_size_limit', b.file_size_limit, 'allowed_mime_types', b.allowed_mime_types)) from storage.buckets b),
    'storage_objects', (select jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name, 'size', (o.metadata->>'size')::bigint,
                          'mimetype', o.metadata->>'mimetype', 'updated_at', o.updated_at) order by o.bucket_id, o.name) from storage.objects o),
    'row_counts', jsonb_build_object(
       'listings', (select count(*) from public.listings), 'partner_links', (select count(*) from public.partner_links),
       'app_settings', (select count(*) from public.app_settings), 'cma_leads', (select count(*) from public.cma_leads),
       'mls_import_log', (select count(*) from public.mls_import_log), 'mls_sync_settings', (select count(*) from public.mls_sync_settings),
       'mls_sync_links', (select count(*) from public.mls_sync_links))
  ) into res;
  return res;
end; $$;

revoke all on function public.backup_table(text, text, int, int) from public;
revoke all on function public.backup_schema(text) from public;
grant execute on function public.backup_table(text, text, int, int) to anon, authenticated;
grant execute on function public.backup_schema(text) to anon, authenticated;
