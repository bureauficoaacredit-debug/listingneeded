import { supabaseFetch } from './supabase'

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
  duration_ms: number | null
  label: string | null
  note: string | null
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
    throw new Error(/Invalid sync access code/i.test(msg) ? 'Wrong access code.' : msg)
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
export async function runMlsSync(code: string, dry: boolean): Promise<SyncRunResult> {
  const res = await fetch(`/api/mls-sync${dry ? '?dry=1' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${code}` },
    body: JSON.stringify({ dry, source: 'admin' }),
  })
  const data = (await res.json().catch(() => ({}))) as SyncRunResult
  if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`)
  return data
}
