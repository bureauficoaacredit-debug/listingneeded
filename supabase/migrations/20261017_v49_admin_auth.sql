-- v49: real admin login (Supabase Auth). One admin: bureauficoaacredit@gmail.com (created out-of-band; password not here).
-- Admin writes are enforced by RLS / RPC checks on auth.uid(), not by a password in the public bundle.

create table if not exists private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
revoke all on private.admins from public, anon, authenticated;
insert into private.admins (user_id, email)
select id, email from auth.users where email = 'bureauficoaacredit@gmail.com'
on conflict (user_id) do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from private.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Token checks: the logged-in admin passes; the server sync tokens (mls_sync, mls_sync_cron) still work for the API/cron.
-- The separate CMA leads access code is dropped.
create or replace function private.assert_sync_token(p_token text)
returns void language plpgsql security definer set search_path = '' stable as $$
begin
  if public.is_admin() then return; end if;
  if p_token is null or length(p_token) < 16 or not exists (
    select 1 from private.admin_secrets s
    where s.name in ('mls_sync', 'mls_sync_cron')
      and s.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'Invalid sync access code' using errcode = '28000';
  end if;
end;
$$;

create or replace function private.assert_leads_token(p_token text)
returns void language plpgsql security definer set search_path = '' stable as $$
begin
  if not public.is_admin() then
    raise exception 'Admin login required' using errcode = '28000';
  end if;
end;
$$;
delete from private.admin_secrets where name = 'cma_leads';

-- listings: everyone may read (public Search); the public "List your home" form may only insert an unpaid,
-- not-live DIY draft; everything else (edit, activate, delete, trash, MLS import from the browser) is admin-only.
drop policy if exists "allow insert listings" on public.listings;
drop policy if exists "allow update listings" on public.listings;
drop policy if exists "allow delete listings" on public.listings;
create policy "listings insert: admin or unpaid DIY draft" on public.listings for insert to anon, authenticated
  with check (public.is_admin() or (paid = false and live = false and coalesce(is_mls, false) = false
                                    and deleted_at is null and id not like 'mls%'));
create policy "listings update: admin" on public.listings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "listings delete: admin" on public.listings for delete to authenticated using (public.is_admin());

drop policy if exists "allow insert partner_links" on public.partner_links;
drop policy if exists "allow update partner_links" on public.partner_links;
drop policy if exists "allow delete partner_links" on public.partner_links;
create policy "partner_links insert: admin" on public.partner_links for insert to authenticated with check (public.is_admin());
create policy "partner_links update: admin" on public.partner_links for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "partner_links delete: admin" on public.partner_links for delete to authenticated using (public.is_admin());

drop policy if exists "allow insert app_settings" on public.app_settings;
drop policy if exists "allow update app_settings" on public.app_settings;
create policy "app_settings insert: admin" on public.app_settings for insert to authenticated with check (public.is_admin());
create policy "app_settings update: admin" on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Payment return (Stripe Payment Link -> /#/list?paid=1, and /api/confirm-checkout): the only public write left on an
-- existing listing. Limited to DIY (non-MLS, not trashed) listings; sets paid + live + end date = today + paid term
-- (renew: added on top of a future end date). Same trust level as before, without the open UPDATE policy.
create or replace function public.mark_listing_paid(p_id text, p_renew boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_days int; v_base date := (now() at time zone 'America/New_York')::date; v_cur date; r public.listings;
begin
  select coalesce((value->>'days')::int, 90) into v_days from public.app_settings where key = 'paid_term';
  v_days := greatest(1, least(coalesce(v_days, 90), 3650));
  select active_until into v_cur from public.listings
   where id = p_id and coalesce(is_mls, false) = false and deleted_at is null;
  if not found then raise exception 'Listing not found'; end if;
  if coalesce(p_renew, false) and v_cur is not null and v_cur > v_base then v_base := v_cur; end if;
  update public.listings set paid = true, live = true, active_until = v_base + v_days
   where id = p_id returning * into r;
  return to_jsonb(r);
end;
$$;
revoke all on function public.mark_listing_paid(text, boolean) from public;
grant execute on function public.mark_listing_paid(text, boolean) to anon, authenticated;

-- Public signups are off: the only admin is created by the owner. GoTrue inserts users as supabase_auth_admin,
-- so any signup/invite through the Auth API is rejected here (drop this trigger to add another user).
create or replace function private.block_auth_signups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_user = 'supabase_auth_admin' then
    raise exception 'Signups are disabled for Listing Needed';
  end if;
  return new;
end;
$$;
drop trigger if exists block_signups on auth.users;
create trigger block_signups before insert on auth.users for each row execute function private.block_auth_signups();
