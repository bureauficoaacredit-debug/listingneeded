-- Optional end/lock date for listings. When set and past, Browse hides the row
-- even if live=true. Admin still sees all rows and can clear or extend the date.
alter table public.listings
  add column if not exists active_until date null;
