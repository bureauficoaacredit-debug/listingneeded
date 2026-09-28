/**
 * POST /api/cma
 * Body: { name, email, phone (US, required), address, beds?, baths?, sqft? }
 * Returns: { result, leadSaved, emailed, emailStatus }
 * Runs the CMA from public CT data + Listing Needed listings, emails the report (Resend, if configured),
 * and saves the request to Supabase cma_leads.
 */
import { handleCma } from '../_lib/cmaHandlers.js'

export const config = { maxDuration: 30 }

function send(res, status, payload) {
  if (typeof res.status === 'function') return res.status(status).json(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { error: 'Method not allowed' })
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const out = await handleCma(body)
    return send(res, out.status, out.body)
  } catch (err) {
    console.error('cma failed:', err)
    return send(res, 500, { error: err instanceof Error ? err.message : 'CMA failed' })
  }
}
