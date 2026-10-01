/**
 * POST /api/property-lookup
 * Body: { address, city?, state?, zip? }
 * Returns: { found, beds, baths, sqft, yearBuilt, matchedAddress, source } or { found:false, reason }
 * Listing-form autofill from public assessor records (CT CAMA 2026, Westchester NY parcels). Facts only.
 */
import { handlePropertyLookup } from '../_lib/cmaHandlers.js'

export const config = { maxDuration: 25 }

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
    const out = await handlePropertyLookup(body)
    return send(res, out.status, out.body)
  } catch (err) {
    console.error('property-lookup failed:', err)
    return send(res, 200, { found: false, reason: 'Public records are unavailable right now — enter the details yourself.' })
  }
}
