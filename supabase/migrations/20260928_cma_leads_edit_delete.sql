-- v28: edit / delete / delete-all for CMA leads, gated by the same leads access code hash (private.admin_secrets).
alter table public.cma_leads add column if not exists notes text;

create or replace function private.assert_leads_token(p_token text)
returns void
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
end;
$$;
revoke all on function private.assert_leads_token(text) from public, anon, authenticated;

-- get_cma_leads now shares the check (return type picks up the new notes column)
drop function if exists public.get_cma_leads(text);
create function public.get_cma_leads(p_token text)
returns setof public.cma_leads
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  perform private.assert_leads_token(p_token);
  return query select * from public.cma_leads order by created_at desc;
end;
$$;

create or replace function public.update_cma_lead(
  p_token text, p_id uuid, p_name text, p_email text, p_phone text, p_address text, p_notes text
)
returns public.cma_leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.cma_leads;
begin
  perform private.assert_leads_token(p_token);
  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_email), '') = ''
     or coalesce(btrim(p_phone), '') = '' or coalesce(btrim(p_address), '') = '' then
    raise exception 'Name, email, phone and address are required' using errcode = '22023';
  end if;
  update public.cma_leads
     set name = btrim(p_name), email = lower(btrim(p_email)), phone = btrim(p_phone),
         address = btrim(p_address), notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_id
  returning * into r;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;
  return r;
end;
$$;

create or replace function public.delete_cma_lead(p_token text, p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform private.assert_leads_token(p_token);
  delete from public.cma_leads where id = p_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.delete_all_cma_leads(p_token text, p_confirm text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform private.assert_leads_token(p_token);
  if p_confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm' using errcode = '22023';
  end if;
  delete from public.cma_leads where true;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.get_cma_leads(text) from public;
revoke all on function public.update_cma_lead(text, uuid, text, text, text, text, text) from public;
revoke all on function public.delete_cma_lead(text, uuid) from public;
revoke all on function public.delete_all_cma_leads(text, text) from public;
grant execute on function public.get_cma_leads(text) to anon, authenticated;
grant execute on function public.update_cma_lead(text, uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.delete_cma_lead(text, uuid) to anon, authenticated;
grant execute on function public.delete_all_cma_leads(text, text) to anon, authenticated;
