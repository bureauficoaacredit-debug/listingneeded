import { listingFeeUsd, type ListingType } from './types'

function linkForType(type: ListingType): string {
  const rent = (import.meta.env.VITE_STRIPE_PAYMENT_LINK_RENT as string | undefined)?.trim()
  const sale = (import.meta.env.VITE_STRIPE_PAYMENT_LINK_SALE as string | undefined)?.trim()
  const url = type === 'sale' ? sale : rent
  if (!url) {
    throw new Error(
      `Missing VITE_STRIPE_PAYMENT_LINK_${type === 'sale' ? 'SALE' : 'RENT'} in Vercel. Add the Stripe Payment Link URL, then redeploy.`,
    )
  }
  return url
}

/** Build Stripe Payment Link URL with listing id for reference. */
export function paymentLinkForListing(opts: {
  listingId: string
  type: ListingType
  email?: string
}): string {
  const base = linkForType(opts.type)
  const u = new URL(base)
  u.searchParams.set('client_reference_id', opts.listingId)
  if (opts.email) u.searchParams.set('prefilled_email', opts.email)
  return u.toString()
}

export function feeLabel(type: ListingType): string {
  return `$${listingFeeUsd(type)}`
}
