-- v29: owner-of-record for CMA leads (admin only), sqft + year built on listings (list-form autofill)
alter table public.cma_leads add column if not exists owner_names text;
alter table public.listings add column if not exists sqft numeric;
alter table public.listings add column if not exists year_built integer;

-- get_cma_leads returns setof cma_leads, so recreate it to pick up owner_names
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
revoke all on function public.get_cma_leads(text) from public;
grant execute on function public.get_cma_leads(text) to anon, authenticated;
