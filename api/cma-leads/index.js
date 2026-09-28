/**
 * GET /api/cma-leads   (header: x-admin-password)
 * Returns { leads[] } from Supabase cma_leads. Needs SUPABASE_SERVICE_ROLE_KEY on the server
 * (the table has no public read policy).
 */
import { handleCmaLeads } from '../_lib/cmaHandlers.js'

function send(res, status, payload) {
  if (typeof res.status === 'function') return res.status(status).json(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return send(res, 405, { error: 'Method not allowed' })
  }
  const out = await handleCmaLeads(req.headers['x-admin-password'])
  return send(res, out.status, out.body)
}
