export type ListingType = 'rent' | 'sale'

export type Listing = {
  id: string
  type: ListingType
  address: string
  city: string
  state: string
  zip: string
  beds: number
  baths: number
  price: number
  pets: 'no' | 'yes' | 'negotiable'
  description: string
  photoDataUrls: string[]
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  createdAt: string
  paid: boolean
  live: boolean
  /** True when this is a Realtor/MLS-sourced listing. */
  is_mls?: boolean
  /**
   * Optional end/lock date (YYYY-MM-DD). When set and in the past, Browse
   * treats the listing as inactive even if live=true. Admin still sees it.
   */
  activeUntil?: string | null
}

export const LISTING_FEE_RENT_USD = 99
export const LISTING_FEE_SALE_USD = 800

export function listingFeeUsd(type: ListingType) {
  return type === 'sale' ? LISTING_FEE_SALE_USD : LISTING_FEE_RENT_USD
}

/** True when active_until is unset or still covers today (inclusive). */
export function isActiveUntilOk(activeUntil: string | null | undefined): boolean {
  if (!activeUntil) return true
  const trimmed = activeUntil.trim()
  if (!trimmed) return true
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const today = new Date()
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return ymd <= trimmed
  }
  const end = new Date(trimmed)
  if (Number.isNaN(end.getTime())) return true
  return end.getTime() >= Date.now()
}

/** Defaults used when admin / PDF path publishes MLS rows for Marcel. */
export const MLS_OWNER = {
  name: 'Marcel Najar',
  phone: '203-818-3242',
  email: 'marcel@listingneeded.com',
} as const

export type PartnerCategory = 'mortgage' | 'screening' | 'insurance' | 'moving' | 'other'

export type PartnerLink = {
  id: string
  title: string
  url: string
  category: PartnerCategory
  blurb: string
  sortOrder: number
  enabled: boolean
  createdAt: string
}

export const PARTNER_CATEGORY_LABELS: Record<PartnerCategory, string> = {
  mortgage: 'Mortgage',
  screening: 'Tenant screening',
  insurance: 'Insurance',
  moving: 'Moving',
  other: 'Other',
}
