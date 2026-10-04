-- v38: soft-delete trash (deleted_at), app settings (MLS auto-expire), daily purge of trash older than 7 days
alter table public.listings add column if not exists deleted_at timestamptz;
create index if not exists listings_deleted_at_idx on public.listings (deleted_at) where deleted_at is not null;
create index if not exists listings_active_until_idx on public.listings (active_until);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "allow select app_settings" on public.app_settings;
drop policy if exists "allow insert app_settings" on public.app_settings;
drop policy if exists "allow update app_settings" on public.app_settings;
create policy "allow select app_settings" on public.app_settings for select using (true);
create policy "allow insert app_settings" on public.app_settings for insert with check (true);
create policy "allow update app_settings" on public.app_settings for update using (true) with check (true);

insert into public.app_settings (key, value) values ('mls_expiry', '{"enabled": true, "days": 60}'::jsonb)
on conflict (key) do nothing;

create or replace function public.purge_listing_trash()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.listings where deleted_at is not null and deleted_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_listing_trash() from public, anon, authenticated;

-- pg_cron (available on this Supabase project): purge daily at 07:17 UTC
create extension if not exists pg_cron;
select cron.schedule('purge-listing-trash', '17 7 * * *', $$select public.purge_listing_trash()$$);
