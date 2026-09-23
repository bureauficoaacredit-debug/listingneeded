/**
 * POST /api/parse-mls-pdf
 * Accepts PDF (base64 JSON) OR raw MLS text.
 * Returns { text, drafts[] } for Admin editable preview + publish.
 *
 * Body:
 *   { pdfBase64: string, filename?: string }
 *   { text: string }
 */
import { parseMlsCandidates, parseMlsPdfBuffer } from '../_lib/mlsParse.js'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
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

function decodeBase64Pdf(b64) {
  const raw = String(b64 || '').replace(/^data:application\/pdf;base64,/i, '').trim()
  if (!raw) throw new Error('pdfBase64 is empty.')
  return Buffer.from(raw, 'base64')
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return send(res, 204, {})
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}

    if (body.text != null && String(body.text).trim()) {
      const text = String(body.text)
      const drafts = parseMlsCandidates(text)
      return send(res, 200, { text, drafts, source: 'text' })
    }

    if (!body.pdfBase64 && !body.pdf) {
      return send(res, 400, {
        error: 'Send JSON { pdfBase64 } or { text }.',
      })
    }

    const pdfBuf = decodeBase64Pdf(body.pdfBase64 || body.pdf)
    if (!pdfBuf.length) {
      return send(res, 400, { error: 'PDF payload is empty.' })
    }

    const { text, drafts } = await parseMlsPdfBuffer(pdfBuf)
    return send(res, 200, { text, drafts, source: 'pdf' })
  } catch (err) {
    console.error('parse-mls-pdf failed:', err)
    return send(res, 500, {
      error: err instanceof Error ? err.message : 'PDF parse failed',
    })
  }
}
