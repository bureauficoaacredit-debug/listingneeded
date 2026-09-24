/**
 * POST /api/import-mls-link
 * Body: { url: string }  — SMART MLS portal shared-link URL (or bare UUID)
 * Returns: { drafts[], totalRows, skippedNoMls, skippedStatus, uuid, source }
 *
 * Fetches the ConnectMLS shared-link JSON server-side (avoids browser CORS).
 */
import {
  extractSharedLinkUuid,
  fetchSharedLinkDrafts,
} from '../_lib/sharedLinkMls.js'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}

function send(res, status, payload) {
  if (typeof res.status === 'function') {
    return res.status(status).json(payload)
  }
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return send(res, 204, {})
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const raw = body.url ?? body.link ?? body.sharedLink ?? ''
    const extracted = extractSharedLinkUuid(raw)
    if (extracted.error) {
      return send(res, 400, { error: extracted.error })
    }

    const result = await fetchSharedLinkDrafts(extracted.uuid)
    return send(res, 200, result)
  } catch (err) {
    console.error('import-mls-link failed:', err)
    const msg = err instanceof Error ? err.message : 'Shared-link import failed'
    const status =
      /not found|invalid|must be|Could not find|Paste a/i.test(msg) ? 400 : 502
    return send(res, status, { error: msg })
  }
}
