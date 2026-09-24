/**
 * Client helper: POST SMART MLS shared-link URL → MlsDraft[] via /api/import-mls-link.
 */
import type { MlsDraft } from './pdfMls'

export type ImportMlsLinkResult = {
  drafts: MlsDraft[]
  totalRows: number
  skippedNoMls: number
  skippedStatus: number
  uuid: string
  source: string
}

type ApiResponse = Partial<ImportMlsLinkResult> & { error?: string }

/** Call the serverless import endpoint with a portal shared-link URL. */
export async function importMlsSharedLink(url: string): Promise<ImportMlsLinkResult> {
  const trimmed = String(url || '').trim()
  if (!trimmed) throw new Error('Paste a SMART MLS shared-link URL first.')

  let res: Response
  try {
    res = await fetch('/api/import-mls-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trimmed }),
    })
  } catch (err) {
    throw new Error(
      `Could not reach import API (${err instanceof Error ? err.message : String(err)}).`,
    )
  }

  let data: ApiResponse = {}
  try {
    data = (await res.json()) as ApiResponse
  } catch {
    throw new Error(`Import API returned non-JSON (HTTP ${res.status}).`)
  }

  if (!res.ok) {
    throw new Error(data.error || `Import API failed (HTTP ${res.status}).`)
  }

  const drafts = Array.isArray(data.drafts) ? data.drafts : []
  if (!drafts.length) {
    throw new Error(data.error || 'Import API returned no listings.')
  }

  return {
    drafts,
    totalRows: Number(data.totalRows) || drafts.length,
    skippedNoMls: Number(data.skippedNoMls) || 0,
    skippedStatus: Number(data.skippedStatus) || 0,
    uuid: String(data.uuid || ''),
    source: String(data.source || 'shared-link'),
  }
}
