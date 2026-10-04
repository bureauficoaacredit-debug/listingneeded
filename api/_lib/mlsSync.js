/**
 * v40 automatic MLS import helpers (Node / Vercel). Listing Needed only.
 *
 * A SMART MLS "client portal" email link (https://smartmls.connectmls.com/servlet/QL?D=<code>) answers with a 302 to
 * the portal login carrying a short-lived (2 h) client token. That token authorises the same JSON call the portal itself
 * makes: GET smartmls-apiserver.connectmls.com/api/mylistingsfromagent. Items use the shared-link shape, so the
 * existing mapper (sharedListingToDraft) is reused.
 */
import { listingsPayloadToDrafts } from './sharedLinkMls.js'

const API = 'https://smartmls-apiserver.connectmls.com/api/'
const QL_HOST = 'smartmls.connectmls.com'

/** @returns {{ url: string, code: string } | { error: string }} */
export function normalizePortalLink(raw) {
  const input = String(raw || '').trim()
  if (!input) return { error: 'No MLS link saved yet.' }
  let u
  try {
    u = new URL(input)
  } catch {
    return { error: 'Invalid link.' }
  }
  const code = u.searchParams.get('D') || ''
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== QL_HOST || u.pathname !== '/servlet/QL' || !/^[A-Za-z0-9]{8,40}$/.test(code)) {
    return { error: 'Link must look like https://smartmls.connectmls.com/servlet/QL?D=XXXXXXXX' }
  }
  return { url: `https://${QL_HOST}/servlet/QL?D=${code}`, code }
}

export function maskCode(code) {
  const c = String(code || '')
  return c.length > 8 ? `${c.slice(0, 4)}…${c.slice(-4)}` : '…'
}

async function timedFetch(url, init = {}, ms = 20000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
}

/** Open the portal link, return the client token from the redirect. */
export async function openPortalLink(url) {
  let res
  try {
    res = await timedFetch(url, { redirect: 'manual', headers: { Accept: 'text/html' } }, 15000)
  } catch (e) {
    throw new Error(`Could not reach the SMART MLS link: ${e instanceof Error ? e.message : String(e)}`)
  }
  const loc = res.headers.get('location') || ''
  if (res.status < 300 || res.status >= 400 || !loc) {
    throw new Error(`The MLS link did not redirect to the portal (HTTP ${res.status}). It may have expired or been replaced.`)
  }
  let token = ''
  try {
    const lu = new URL(loc, url)
    if (!/(^|\.)connectmls\.com$/i.test(lu.hostname)) throw new Error('unexpected redirect host')
    token = lu.searchParams.get('token') || ''
  } catch (e) {
    throw new Error(`Unexpected redirect from the MLS link: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!token) {
    throw new Error('The MLS link redirected without a portal session (link expired, revoked or invalid).')
  }
  return token
}

/** Page through the agent's matched listings. */
export async function fetchPortalListings(token) {
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` }
  const all = []
  let total = Infinity
  for (let off = 0; off < 5000 && all.length < total; off += 100) {
    let res
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await timedFetch(`${API}mylistingsfromagent?offset=${off}&limit=100&sortorder=Newest`, { headers })
        if (res.status < 500) break
      } catch (e) {
        if (attempt === 1) throw new Error(`SMART MLS API unreachable: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (!res || !res.ok) throw new Error(`SMART MLS API returned HTTP ${res ? res.status : '???'} at offset ${off}.`)
    const j = await res.json().catch(() => null)
    if (!j || !Array.isArray(j.Listings)) throw new Error('SMART MLS API returned an unexpected response.')
    total = Number(j.TotalCount) || 0
    if (!j.Listings.length) break
    all.push(...j.Listings)
  }
  return { listings: all, totalCount: Number.isFinite(total) ? total : all.length }
}

/** Map portal listings to the rows the database function expects. */
export function toSyncHomes(listings) {
  const parsed = listingsPayloadToDrafts(listings)
  const homes = parsed.drafts.map((d) => ({
    id: d.id,
    type: d.type,
    address: d.address,
    city: d.city,
    state: d.state,
    zip: d.zip,
    beds: d.beds,
    baths: d.baths,
    price: d.price,
    description: d.description,
    photo_urls: (d.photoDataUrls || []).slice(0, 40),
    sqft: d.sqft ?? null,
    year_built: d.yearBuilt ?? null,
    mls_status: d.mlsStatus ?? null,
  }))
  return { homes, skipped: parsed.skippedNoMls + parsed.skippedStatus, totalRows: parsed.totalRows }
}

/** Supabase RPC with the anon key only (every function checks the sync token itself). */
export async function rpc(fn, args) {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  if (!url || !key) throw Object.assign(new Error('Supabase URL/anon key not configured on the server'), { status: 500 })
  const headers = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(25000) })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (data && data.message) || `Supabase RPC ${fn} failed (${res.status})`
    throw Object.assign(new Error(msg), { status: /Invalid sync access code/i.test(msg) ? 401 : 502 })
  }
  return data
}
