-- Partner / resource links (mortgage, screening, etc.)
create table if not exists public.partner_links (
  id text primary key,
  title text not null,
  url text not null,
  category text not null check (category in ('mortgage', 'screening', 'insurance', 'moving', 'other')),
  blurb text default '',
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.partner_links enable row level security;

drop policy if exists "allow select partner_links" on public.partner_links;
drop policy if exists "allow insert partner_links" on public.partner_links;
drop policy if exists "allow update partner_links" on public.partner_links;
drop policy if exists "allow delete partner_links" on public.partner_links;

create policy "allow select partner_links"
  on public.partner_links for select using (true);

create policy "allow insert partner_links"
  on public.partner_links for insert with check (true);

create policy "allow update partner_links"
  on public.partner_links for update using (true) with check (true);

create policy "allow delete partner_links"
  on public.partner_links for delete using (true);
