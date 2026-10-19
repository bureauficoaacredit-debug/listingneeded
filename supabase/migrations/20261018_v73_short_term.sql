-- v73: "Short-term stays": hosts list their place on Listing Needed (type 'short-term', price = $ per night).
-- Same RLS / is_admin rules as every listing (no policy changes): public reads, unpaid DIY drafts insert, admin edits.
alter table public.listings drop constraint if exists listings_type_check;
alter table public.listings add constraint listings_type_check check (type in ('rent', 'sale', 'short-term'));
alter table public.listings add column if not exists min_nights integer;
alter table public.listings add column if not exists max_guests integer;
alter table public.listings add column if not exists also_on_other_sites boolean;  -- host says it's also on Airbnb/VRBO (admin only; no links shown)
alter table public.listings drop constraint if exists listings_short_term_chk;
alter table public.listings add constraint listings_short_term_chk check (
  (min_nights is null or min_nights between 1 and 365) and (max_guests is null or max_guests between 1 and 50)
);
