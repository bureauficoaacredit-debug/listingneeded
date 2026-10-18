-- v59: faster Search page. PostgREST computed column "cover_photo" = first photo only, so the public feed no longer
-- downloads every photo URL (avg 27 per MLS home) and the full description for ~2,250 homes.
create or replace function public.cover_photo(l public.listings)
returns text language sql stable set search_path = '' as $$
  select l.photo_urls[1]
$$;
grant execute on function public.cover_photo(public.listings) to anon, authenticated;

-- v59: MLS # pulled from the description (for the rare MLS row whose id isn't mls_<n>) so Search keeps MLS-number matching
-- without downloading full descriptions.
create or replace function public.mls_ref(l public.listings)
returns text language sql stable set search_path = '' as $$
  select (regexp_match(coalesce(l.description, ''), 'MLS\s*#\s*(\d+)', 'i'))[1]
$$;
grant execute on function public.mls_ref(public.listings) to anon, authenticated;
