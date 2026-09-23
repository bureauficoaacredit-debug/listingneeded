# Stripe confirmation receipts (two recipients)

## Who gets email

1. **Person who listed / paid** — email from the List form (`ownerEmail`), prefilled into Stripe Checkout via `prefilled_email`. They get Stripe’s payment receipt when **Customer emails → Successful payments** is ON in the Stripe Dashboard.
2. **Listing Needed account** — business inbox (default `bureauficoaacredit@gmail.com`, also `VITE_LISTING_NEEDED_NOTIFY_EMAIL`). Turn on Stripe **Team / payment notifications** (or “Email me when I receive a payment”) so this inbox gets a copy of each successful charge.

## What we cannot do from the website alone

Payment Links run on Stripe. The static Vite app cannot send mail “from Stripe.” Dual delivery is Stripe Dashboard settings + the prefilled customer email already wired in `src/lib/checkout.ts`.

## Checklist

- [ ] Stripe Dashboard → Settings → Customer emails → Successful payments = ON
- [ ] Stripe Dashboard → notifications to Listing Needed inbox ON
- [ ] Vercel env optional: `VITE_LISTING_NEEDED_NOTIFY_EMAIL=bureauficoaacredit@gmail.com`
