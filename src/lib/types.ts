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
  /** Optional living area (sq ft) and year built — autofilled from public records on the list form. */
  sqft?: number | null
  yearBuilt?: number | null
  /** v67: annual property taxes (+ tax year) and HOA / common charges (amount + how often); null = unknown (row hidden). */
  taxesAnnual?: number | null
  taxYear?: number | null
  hoaFee?: number | null
  hoaFrequency?: HoaFrequency | null
  /** v68: 'apartment' | 'condo' | 'house' (computed in the database from the MLS subtype / description) */
  ptype?: string | null
  /** v38: set when moved to the admin Trash (undo window 7 days, then purged). */
  deletedAt?: string | null
  /** v40: MLS status from the feed (e.g. 'Active', 'Under Contract - Continue to Show'); null for DIY. */
  mlsStatus?: string | null
  /** v50: 'free-qr' (free QR listing) | 'qr-paid' (paid QR) | null */
  source?: string | null
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
  email: 'bureauficoaacredit@gmail.com',
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

/** v40: short badge text for a feed status; null when the home is simply Active (no badge needed). */
export function mlsStatusBadge(status: string | null | undefined): string | null {
  const s = String(status || '').trim()
  if (!s || /^(active|actv|new)$/i.test(s)) return null
  if (/under\s*contract|\bUC\b/i.test(s)) return 'Under Contract'
  if (/pending/i.test(s)) return 'Pending'
  if (/contingent/i.test(s)) return 'Contingent'
  return s.length > 24 ? s.slice(0, 24) : s
}

// v67: taxes / HOA display helpers
export type HoaFrequency = 'month' | 'quarter' | 'half-year' | 'year' | 'week'
export const HOA_FREQUENCIES: { value: HoaFrequency; label: string; short: string }[] = [
  { value: 'month', label: 'Monthly', short: 'mo' },
  { value: 'quarter', label: 'Quarterly', short: 'quarter' },
  { value: 'half-year', label: 'Every 6 months', short: '6 mo' },
  { value: 'year', label: 'Yearly', short: 'yr' },
  { value: 'week', label: 'Weekly', short: 'wk' },
]
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
/** "$8,250/yr (2025)" or null when unknown. */
export function formatTaxes(l: Pick<Listing, 'taxesAnnual' | 'taxYear'>, withYear = true) {
  if (l.taxesAnnual == null || !(l.taxesAnnual > 0)) return null
  return `${usd(l.taxesAnnual)}/yr${withYear && l.taxYear ? ` (${l.taxYear} taxes)` : ''}`
}
/** "$350/mo" or "$1,200/quarter" (no frequency known: just the amount); null when unknown. */
export function formatHoa(l: Pick<Listing, 'hoaFee' | 'hoaFrequency'>) {
  if (l.hoaFee == null || !(l.hoaFee > 0)) return null
  const f = HOA_FREQUENCIES.find((x) => x.value === l.hoaFrequency)
  return `${usd(l.hoaFee)}${f ? `/${f.short}` : ''}`
}
