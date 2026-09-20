# Listing Needed

Self-serve home listings for **rent or sale**. Owners pay a **$200** one-time fee, the listing goes live, and interested people contact the owner directly — no agent middleman in the flow.

**Brand:** [listingneeded.com](https://www.listingneeded.com) · Marcel Najar · 203-818-3242

## Features

- Browse live listings
- List a home (rent or sale) with photos + contact
- **$200** listing fee gate (demo confirms payment; wire Stripe for production)
- Owner contact shown on live listing pages

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Production next steps

1. Replace the demo payment confirm with **Stripe Checkout** ($200)
2. Store listings + photos in **Supabase** (or S3/R2 + Postgres)
3. Deploy to **Vercel** or GitHub Pages
4. Add webhook: `checkout.session.completed` → mark listing `paid` + `live`

## License

Private — Listing Needed / Marcel Najar
