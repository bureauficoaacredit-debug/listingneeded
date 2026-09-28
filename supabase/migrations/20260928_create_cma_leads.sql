-- v26: CMA leads (applied via Supabase MCP on 2026-09-28)
create table if not exists public.cma_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  phone text not null check (char_length(phone) between 10 and 40),
  address text not null check (char_length(address) between 3 and 400),
  beds numeric,
  baths numeric,
  sqft numeric,
  estimate numeric,
  estimate_low numeric,
  estimate_high numeric,
  comps_count integer,
  result_summary text,
  email_status text
);
create index if not exists cma_leads_created_at_idx on public.cma_leads (created_at desc);
alter table public.cma_leads enable row level security;
drop policy if exists "cma_leads insert only" on public.cma_leads;
create policy "cma_leads insert only" on public.cma_leads for insert to anon, authenticated with check (true);
-- No select/update/delete policies: read with the service role (/api/cma-leads) or the Supabase dashboard.
