-- v27: token-gated admin read of cma_leads (applied via Supabase MCP on 2026-09-28).
-- The access code itself is NOT stored anywhere in the database or the repo — only its SHA-256 hex,
-- inserted separately into private.admin_secrets (name = 'cma_leads').
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.admin_secrets (
  name text primary key,
  token_sha256 text not null,
  created_at timestamptz not null default now()
);
revoke all on private.admin_secrets from public, anon, authenticated;

create or replace function public.get_cma_leads(p_token text)
returns setof public.cma_leads
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if p_token is null or length(p_token) < 16 or not exists (
    select 1 from private.admin_secrets s
    where s.name = 'cma_leads'
      and s.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'Invalid leads access code' using errcode = '28000';
  end if;
  return query select * from public.cma_leads order by created_at desc;
end;
$$;

revoke all on function public.get_cma_leads(text) from public;
grant execute on function public.get_cma_leads(text) to anon, authenticated;

-- Rotate the code: update private.admin_secrets set token_sha256 = encode(sha256(convert_to('<NEW CODE>','UTF8')),'hex') where name = 'cma_leads';
