# Listing Needed

Self-serve home listings for **rent or sale**. Owners pay a listing fee, the listing goes live, and interested people contact the owner directly — no agent middleman in the flow.

**Brand:** [listingneeded.com](https://www.listingneeded.com) · Marcel Najar · 203-818-3242

## Features

- Browse live listings
- List a home (rent or sale) with photos + contact
- Listing fee gate (demo confirms payment; wire Stripe for production)
- Owner contact shown on live listing pages
- Lightweight `/#/admin` page to delete test listings (password-gated)

## Run locally

```bash
cp .env.example .env   # fill in Supabase + VITE_ADMIN_PASSWORD
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Admin (delete test listings)

1. Set **`VITE_ADMIN_PASSWORD`** in Vercel (Project → Settings → Environment Variables) and redeploy. Same var in local `.env` for `npm run dev`.
2. Open `/#/admin` (or the muted **Admin** link in the footer), unlock with the password.
3. One-time SQL in the Supabase SQL editor so hard delete works with the anon key (otherwise admin falls back to soft-delete `live=false, paid=false`):

```sql
drop policy if exists "allow delete listings" on public.listings;
create policy "allow delete listings" on public.listings for delete using (true);
```

> Note: `VITE_ADMIN_PASSWORD` is visible in the client bundle — fine for early private use. Move admin to server-side auth later (e.g. with Stripe).

## Production next steps

1. Replace the demo payment confirm with **Stripe Checkout**
2. Store listings + photos in **Supabase** (or S3/R2 + Postgres)
3. Deploy to **Vercel** or GitHub Pages
4. Add webhook: `checkout.session.completed` → mark listing `paid` + `live`

## License

Private — Listing Needed / Marcel Najar
