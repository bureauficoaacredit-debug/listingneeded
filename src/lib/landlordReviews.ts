import { supabaseFetch } from './supabase'

/** v70 "Reporting your landlord": public reads approved only (RLS); create via RPC; admin approves/edits/deletes. */
export type ReviewStatus = 'pending' | 'approved' | 'rejected'
export type LandlordReview = {
  id: string
  created_at: string
  town: string
  rating: number
  would_rent_again: boolean
  body: string
  display_name: string | null
}
export type AdminLandlordReview = LandlordReview & {
  status: ReviewStatus
  flagged: boolean
  flag_reasons: string[]
  reviewed_at: string | null
  landlord_review_private: { email: string | null } | null
}
export type ReviewInput = {
  town: string
  rating: number
  would_rent_again: boolean
  body: string
  display_name?: string
  email?: string
  honest: boolean
  website?: string // honeypot
}

async function errorText(res: Response, fallback: string) {
  const d = await res.json().catch(() => ({}))
  return String(d.message || d.error_description || d.error || fallback)
}

const PUBLIC_COLS = 'id,created_at,town,rating,would_rent_again,body,display_name'

export async function fetchApprovedReviews(): Promise<LandlordReview[]> {
  const res = await supabaseFetch(`/rest/v1/landlord_reviews?select=${PUBLIC_COLS}&status=eq.approved&order=created_at.desc&limit=1000`)
  if (!res.ok) throw new Error(await errorText(res, 'Could not load experiences'))
  return res.json()
}

export async function submitReview(input: ReviewInput): Promise<void> {
  const res = await supabaseFetch('/rest/v1/rpc/submit_landlord_review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p: input }),
  })
  if (!res.ok) throw new Error(await errorText(res, 'Could not send. Please try again.'))
}

export async function fetchAllReviews(): Promise<AdminLandlordReview[]> {
  const res = await supabaseFetch('/rest/v1/landlord_reviews?select=*,landlord_review_private(email)&order=created_at.desc&limit=2000')
  if (!res.ok) throw new Error(await errorText(res, 'Could not load landlord reviews'))
  return res.json()
}

export async function pendingReviewCount(): Promise<number> {
  const res = await supabaseFetch('/rest/v1/landlord_reviews?select=id&status=eq.pending', {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  })
  if (!res.ok) return 0
  return Number(res.headers.get('content-range')?.split('/')[1] ?? 0) || 0
}

export type ReviewEdit = Partial<Pick<AdminLandlordReview, 'town' | 'rating' | 'would_rent_again' | 'body' | 'display_name' | 'status' | 'reviewed_at'>>

export async function updateReview(id: string, patch: ReviewEdit): Promise<AdminLandlordReview> {
  const res = await supabaseFetch(`/rest/v1/landlord_reviews?id=eq.${encodeURIComponent(id)}&select=*,landlord_review_private(email)`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(await errorText(res, 'Could not save'))
  const rows = (await res.json()) as AdminLandlordReview[]
  if (!rows[0]) throw new Error('Not saved (admin login required).')
  return rows[0]
}

export async function deleteReview(id: string): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/landlord_reviews?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await errorText(res, 'Could not delete'))
}

export async function deleteAllReviews(): Promise<number> {
  const res = await supabaseFetch('/rest/v1/landlord_reviews?id=not.is.null', { method: 'DELETE', headers: { Prefer: 'return=representation' } })
  if (!res.ok) throw new Error(await errorText(res, 'Could not delete'))
  return ((await res.json()) as unknown[]).length
}

export const fmtMonthYear = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', year: 'numeric' })

/** Same patterns the database flags (shown as a gentle warning before sending). */
export function personalInfoHints(text: string): string[] {
  const out: string[] = []
  if (/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(text)) out.push('a phone number')
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) out.push('an email address')
  if (/\b\d{1,6}\s+([a-z0-9.'-]+\s+){0,3}(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|way|pl|place|ter|terrace|hwy|highway|pkwy|parkway|cir|circle|tpke|turnpike|sq|square)\b/i.test(text))
    out.push('a street address')
  return out
}
