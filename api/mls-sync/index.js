/**
 * POST /api/mls-sync   (v40 — automatic MLS import, Listing Needed only)
 *
 * Auth: `Authorization: Bearer <sync token>` (or body.token). The token is checked by the database (SHA-256 vs
 * private.admin_secrets) — this function only holds the public anon key.
 *
 * Body (JSON, all optional):
 *   link      a smartmls.connectmls.com/servlet/QL?D=… link; it is saved as the link to use from now on
 *   action    'run' (default) | 'save' (only save link/switch) | 'status'
 *   dry       true -> preview only (also ?dry=1)
 *   enabled   true/false -> flips the on/off switch
 *   source    'scheduled' (default for real runs) | 'admin' | 'api'   (admin runs ignore the off switch)
 *
 * Response: { ok, dry, summary: "141 new, 159 updated", new, updated, unchanged, notSeen, errors, ... }
 * Rules: add new homes, refresh price/status/photos of existing ones by MLS number, never duplicate, never remove or
 * un-trash, new homes expire after the admin "MLS expire after N days" setting (60).
 */
import {
  fetchPortalListings,
  maskCode,
  normalizePortalLink,
  openPortalLink,
  rpc,
  toSyncHomes,
} from '../_lib/mlsSync.js'

export const config = { api: { bodyParser: { sizeLimit: '1mb' } }, maxDuration: 60 }

function send(res, status, payload) {
  if (typeof res.status === 'function') return res.status(status).json(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { error: 'POST only' })
  }
  const t0 = Date.now()
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const auth = String(req.headers?.authorization || '')
    const token = (auth.match(/^Bearer\s+(.+)$/i)?.[1] || body.token || '').trim()
    if (!token) return send(res, 401, { error: 'Missing sync token (Authorization: Bearer <token>).' })

    const q = new URL(req.url || '/', 'https://x').searchParams
    const dry = body.dry === true || body.dry === 1 || q.get('dry') === '1' || q.get('dry') === 'true'
    const action = String(body.action || 'run')
    const source = ['scheduled', 'admin', 'api'].includes(body.source) ? body.source : 'scheduled'

    // 1. switch / link updates (also validates the token)
    let settings
    const wantsEnabled = typeof body.enabled === 'boolean' ? body.enabled : null
    const wantsLink = body.link != null ? String(body.link) : null
    if (wantsLink != null || wantsEnabled != null) {
      if (wantsLink) {
        const n = normalizePortalLink(wantsLink)
        if (n.error) return send(res, 400, { error: n.error })
      }
      settings = await rpc('mls_sync_set_settings', { p_token: token, p_enabled: wantsEnabled, p_link: wantsLink })
    } else {
      settings = await rpc('mls_sync_get_settings', { p_token: token })
    }
    const norm = settings.link ? normalizePortalLink(settings.link) : null
    const base = { enabled: settings.enabled, linkSaved: !!norm && !norm.error, link: norm && !norm.error ? maskCode(norm.code) : null }

    if (action === 'status') return send(res, 200, { ok: true, ...base, lastRunAt: settings.last_run_at, lastResult: settings.last_result })
    if (action === 'save') return send(res, 200, { ok: true, saved: true, ...base })

    // 2. run
    if (!settings.enabled && !dry && source !== 'admin') {
      return send(res, 200, { ok: true, skipped: 'off', message: 'MLS auto-import is switched OFF in Admin.', ...base })
    }
    if (!norm || norm.error) return send(res, 400, { error: norm?.error || 'No MLS link saved yet. Send {"link": "https://smartmls.connectmls.com/servlet/QL?D=…"}.' })

    const portalToken = await openPortalLink(norm.url)
    const { listings, totalCount } = await fetchPortalListings(portalToken)
    if (!listings.length) return send(res, 502, { error: 'The MLS portal returned 0 homes for this link.' })
    const { homes, skipped, totalRows } = toSyncHomes(listings)

    const result = await rpc('mls_sync_apply', {
      p_token: token,
      p_homes: homes,
      p_dry: dry,
      p_source: source,
      p_link_hint: maskCode(norm.code),
      p_skipped: skipped,
    })
    return send(res, 200, {
      ok: true,
      ...result,
      summary: `${result.new} new, ${result.updated} updated`,
      portalTotal: totalCount,
      portalRows: totalRows,
      skippedByMapper: skipped,
      source,
      ms: Date.now() - t0,
      ...base,
    })
  } catch (err) {
    const status = Number(err?.status) || (/MLS link|portal|SMART MLS/i.test(String(err?.message)) ? 502 : 500)
    return send(res, status, { error: err instanceof Error ? err.message : 'mls-sync failed' })
  }
}
