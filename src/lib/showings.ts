import { supabaseFetch } from './supabase'

/** v54 "Schedule a showing" requests. Public: create via RPC only. Admin: read/update/delete (RLS is_admin()). */
export type ShowingStatus = 'new' | 'confirmed' | 'done'
export type ShowingRequest = {
  id: string
  created_at: string
  listing_id: string
  address: string
  mls_number: string | null
  preferred_date: string
  preferred_time: string
  alt_date: string | null
  alt_time: string | null
  name: string
  phone: string
  email: string | null
  message: string | null
  status: ShowingStatus
  admin_notes: string | null
}

export type ShowingInput = {
  listing_id: string
  preferred_date: string
  preferred_time: string
  alt_date?: string
  alt_time?: string
  name: string
  phone: string
  email?: string
  message?: string
  website?: string // honeypot
}

async function errorText(res: Response, fallback: string) {
  const d = await res.json().catch(() => ({}))
  return String(d.message || d.error_description || d.error || fallback)
}

export async function requestShowing(input: ShowingInput): Promise<void> {
  const res = await supabaseFetch('/rest/v1/rpc/request_showing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p: input }),
  })
  if (!res.ok) throw new Error(await errorText(res, 'Could not send your request. Please call or text 203-818-3242.'))
}

export async function fetchShowingRequests(): Promise<ShowingRequest[]> {
  const res = await supabaseFetch('/rest/v1/showing_requests?select=*&order=created_at.desc&limit=1000')
  if (!res.ok) throw new Error(await errorText(res, 'Could not load showing requests'))
  return res.json()
}

export type ShowingEdit = Partial<
  Pick<ShowingRequest, 'status' | 'preferred_date' | 'preferred_time' | 'alt_date' | 'alt_time' | 'name' | 'phone' | 'email' | 'message' | 'admin_notes'>
>

export async function updateShowingRequest(id: string, patch: ShowingEdit): Promise<ShowingRequest> {
  const res = await supabaseFetch(`/rest/v1/showing_requests?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(await errorText(res, 'Could not save'))
  const rows = (await res.json()) as ShowingRequest[]
  if (!rows[0]) throw new Error('Not saved (admin login required).')
  return rows[0]
}

export async function deleteShowingRequest(id: string): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/showing_requests?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await errorText(res, 'Could not delete'))
}

export async function deleteAllShowingRequests(): Promise<number> {
  const res = await supabaseFetch('/rest/v1/showing_requests?id=not.is.null', {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })
  if (!res.ok) throw new Error(await errorText(res, 'Could not delete'))
  return ((await res.json()) as unknown[]).length
}
