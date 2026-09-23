-- Mark Realtor/MLS-sourced homes while keeping them in the normal live listings feed.
alter table public.listings
  add column if not exists is_mls boolean not null default false;
