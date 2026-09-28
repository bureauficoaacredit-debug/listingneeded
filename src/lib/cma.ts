import { supabaseFetch } from './supabase'

export type CmaComp = {
  address: string
  town: string
  status: 'Sold' | 'Active'
  price: number | null
  date: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  ppsf: number | null
  distanceMi: number | null
  source: string
  url: string | null
}

export type CmaMethod = { name: string; value: number; low: number; high: number; detail: string }

export type CmaResult = {
  subject: {
    input: string
    matchedAddress: string
    town: string
    beds: number | null
    baths: number | null
    sqft: number | null
    bedsSource: string | null
    sqftSource: string | null
    propertyType: string
    style: string | null
    yearBuilt: number | null
    acres: number | null
    assessed: number | null
    appraised: number | null
    lastSalePrice: number | null
    lastSaleDate: string | null
    assessorUrl: string | null
  }
  estimate: { value: number; low: number; high: number; methods: CmaMethod[] } | null
  stats: {
    soldCount: number
    activeCount: number
    soldAvg: number | null
    soldMedian: number | null
    soldMedianPpsf: number | null
    activeAvg: number | null
    activeMedian: number | null
    radiusMi: number | null
  }
  comps: CmaComp[]
  sources: { name: string; status: string; detail?: string }[]
  notes: string[]
  dataThrough: string | null
  summary: string
  generatedAt: string
  disclaimer: string
}

export type CmaResponse = { result: CmaResult; leadSaved: boolean; emailed: boolean; emailStatus: string }

export type CmaLead = {
  id: string
  created_at: string
  name: string
  email: string
  phone: string
  address: string
  beds: number | null
  baths: number | null
  sqft: number | null
  estimate: number | null
  estimate_low: number | null
  estimate_high: number | null
  comps_count: number | null
  result_summary: string | null
  email_status: string | null
  notes: string | null
}

/** Same rules as the server: 10-digit NANP number (optional leading 1). Returns "(203) 818-3242" or null. */
export function normalizeUsPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d) || /^[2-9]11/.test(d)) return null
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Live formatting while typing: 2038183242 → (203) 818-3242 */
export function formatPhoneInput(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  d = d.slice(0, 10)
  if (d.length < 4) return d
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(e.trim())

export const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`

export async function requestCma(body: Record<string, unknown>): Promise<CmaResponse> {
  const res = await fetch('/api/cma', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as CmaResponse
}

/**
 * Admin lead functions (Postgres SECURITY DEFINER RPCs). Every call carries the leads access code;
 * the database checks its SHA-256 against the hash stored in the private schema before doing anything.
 * The table itself has no public read / update / delete policy.
 */
async function leadsRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await supabaseFetch(`/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (data && (data.message as string)) || `Request failed (${res.status})`
    throw new Error(/Invalid leads access code/i.test(msg) ? 'Wrong access code.' : msg)
  }
  return data as T
}

export const fetchCmaLeads = (code: string) => leadsRpc<CmaLead[]>('get_cma_leads', { p_token: code.trim() })

export type CmaLeadEdit = { name: string; email: string; phone: string; address: string; notes: string }

export const updateCmaLead = (code: string, id: string, e: CmaLeadEdit) =>
  leadsRpc<CmaLead>('update_cma_lead', {
    p_token: code,
    p_id: id,
    p_name: e.name,
    p_email: e.email,
    p_phone: e.phone,
    p_address: e.address,
    p_notes: e.notes,
  })

export const deleteCmaLead = (code: string, id: string) =>
  leadsRpc<number>('delete_cma_lead', { p_token: code, p_id: id })

export const deleteAllCmaLeads = (code: string) =>
  leadsRpc<number>('delete_all_cma_leads', { p_token: code, p_confirm: 'DELETE' })
