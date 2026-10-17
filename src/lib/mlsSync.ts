import { getAccessToken } from './auth'
import { supabaseFetch } from './supabase'

/** v49: API calls from the admin carry the admin's JWT (or an explicit sync token when given). */
async function bearer(code: string): Promise<string> {
  return code || (await getAccessToken()) || ''
}

/**
 * v40 admin helpers for the automatic MLS import. Everything goes through token-gated SECURITY DEFINER RPCs
 * (the tables have RLS on with no policies); the saved portal link is never readable without the access code.
 */
export const SYNC_CODE_KEY = 'listingneeded_mls_sync_code'

export type SyncSettings = {
  enabled: boolean
  link: string | null
  last_run_at: string | null
  last_result: Record<string, unknown> | null
}

export type ImportLogRow = {
  id: string
  created_at: string
  mode: 'dry' | 'real'
  source: string
  link_hint: string | null
  total_count: number
  new_count: number
  updated_count: number
  unchanged_count: number
  not_seen_count: number
  skipped_count: number
  error_count: number
  errors: { message?: string } | null
  duration_ms: number | null
  label: string | null
  note: string | null
}

/** v48: one saved MLS link (QL?D= portal link or smartmls-portal shared link). */
export type SyncLink = {
  id: string
  created_at: string
  label: string
  url: string
  kind: 'portal' | 'shared'
  enabled: boolean
  last_run_at: string | null
  last_result: { ok?: boolean; summary?: string; homes?: number; error?: string; new?: number; updated?: number } | null
}

export type SyncRunResult = {
  ok: boolean
  dry?: boolean
  summary?: string
  new?: number
  updated?: number
  unchanged?: number
  notSeen?: number
  errors?: number
  total?: number
  skipped?: string
  message?: string
  error?: string
  perLink?: { id: string; label: string; ok: boolean; summary?: string; error?: string; homes?: number }[]
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await supabaseFetch(`/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (data && (data.message as string)) || `Request failed (${res.status})`
    throw new Error(/Invalid sync access code/i.test(msg) ? 'Admin login required — sign in again.' : msg)
  }
  return data as T
}

export const getSyncSettings = (code: string) => rpc<SyncSettings>('mls_sync_get_settings', { p_token: code })
export const setSyncEnabled = (code: string, enabled: boolean) =>
  rpc<SyncSettings>('mls_sync_set_settings', { p_token: code, p_enabled: enabled })
export const setSyncLink = (code: string, link: string) => rpc<SyncSettings>('mls_sync_set_settings', { p_token: code, p_link: link })
export const listImportLog = (code: string) => rpc<ImportLogRow[]>('mls_import_log_list', { p_token: code })
export const updateImportLog = (code: string, id: string, label: string, note: string) =>
  rpc<ImportLogRow>('mls_import_log_update', { p_token: code, p_id: id, p_label: label, p_note: note })
export const deleteImportLog = (code: string, id: string) => rpc<number>('mls_import_log_delete', { p_token: code, p_id: id })
export const deleteAllImportLog = (code: string) => rpc<number>('mls_import_log_delete_all', { p_token: code, p_confirm: 'DELETE' })

/** Run the import through the server function (reads the portal link server-side). */
export async function runMlsSync(code: string, dry: boolean, id?: string): Promise<SyncRunResult> {
  const res = await fetch(`/api/mls-sync${dry ? '?dry=1' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await bearer(code)}` },
    body: JSON.stringify({ dry, source: 'admin', ...(id ? { id } : {}) }),
  })
  const data = (await res.json().catch(() => ({}))) as SyncRunResult
  if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`)
  return data
}

// v48: saved links (list / edit / delete / delete all go straight to the token-gated RPCs; add goes through the API,
// which validates and normalizes either link format)
export const listSyncLinks = (code: string) => rpc<SyncLink[]>('mls_sync_links_list', { p_token: code })
export const updateSyncLink = (code: string, id: string, patch: { label?: string; enabled?: boolean }) =>
  rpc<SyncLink>('mls_sync_link_save', {
    p_token: code,
    p_id: id,
    p_label: patch.label ?? null,
    p_url: null,
    p_kind: null,
    p_enabled: patch.enabled ?? null,
  })
export const deleteSyncLink = (code: string, id: string) => rpc<number>('mls_sync_link_delete', { p_token: code, p_id: id })
export const deleteAllSyncLinks = (code: string) => rpc<number>('mls_sync_link_delete_all', { p_token: code, p_confirm: 'DELETE' })

export async function addSyncLink(code: string, link: string, label: string): Promise<void> {
  const res = await fetch('/api/mls-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await bearer(code)}` },
    body: JSON.stringify({ action: 'link-save', link, ...(label.trim() ? { label: label.trim() } : {}) }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error || `Could not save the link (${res.status})`)
}

/** Mask a saved link for display: D=2PUM…S6PD or shared …06f1…8c. */
export function maskSyncLink(url: string): string {
  const d = /[?&]D=([A-Za-z0-9]+)/.exec(url)
  if (d) return `QL?D=${d[1].slice(0, 4)}…${d[1].slice(-4)}`
  const u = /([0-9a-f]{8}-[0-9a-f-]{27})/i.exec(url)
  return u ? `shared-link …${u[1].slice(-6)}` : '…'
}
