/**
 * POST /api/mls-sync   (v40 automatic MLS import; v48 several saved links, Listing Needed only)
 *
 * Auth: `Authorization: Bearer <sync token>` (or body.token), or (v49) the logged-in admin's Supabase JWT, checked by the database (SHA-256 vs private.admin_secrets).
 * This function only holds the public anon key.
 *
 * Body (JSON, all optional):
 *   link      a QL?D= or smartmls-portal shared-link URL -> added to the saved links (kept, also runs with the others)
 *   label     label for `link`
 *   action    'run' (default) | 'save' | 'status' | 'links' | 'link-save' | 'link-delete' | 'link-delete-all'
 *   id        saved link id for link-save / link-delete / run (run only that link)
 *   enabled   with no id: the global on/off switch; with id: that link's on/off
 *   dry       true -> preview only (also ?dry=1)
 *   source    'scheduled' | 'auto-hourly' | 'admin' | 'api'  (admin runs ignore the global off switch)
 *
 * Each enabled saved link is read and applied in turn (one import-log row per link) with the v40 rules: add new homes,
 * refresh price/status/photos of existing ones by MLS number, never duplicate, never remove or un-trash.
 */
import { fetchLinkListings, normalizeAnyLink, rpc, toSyncHomes } from '../_lib/mlsSync.js'
import { fetchTaxHoa } from '../_lib/mlsDetails.js'

export const config = { api: { bodyParser: { sizeLimit: '1mb' } }, maxDuration: 60 }

function send(res, status, payload) {
  if (typeof res.status === 'function') return res.status(status).json(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function publicLink(l) {
  const n = normalizeAnyLink(l.url)
  return {
    id: l.id,
    label: l.label,
    kind: l.kind,
    enabled: l.enabled,
    hint: n.error ? '…' : n.hint,
    lastRunAt: l.last_run_at,
    lastResult: l.last_result,
    createdAt: l.created_at,
  }
}

const fail = (msg, status) => Object.assign(new Error(msg), { status })

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { error: 'POST only' })
  }
  const t0 = Date.now()
  let ctx = null
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const auth = String(req.headers?.authorization || '')
    const token = (auth.match(/^Bearer\s+(.+)$/i)?.[1] || body.token || '').trim()
    if (!token) return send(res, 401, { error: 'Missing sync token (Authorization: Bearer <token>).' })

    const q = new URL(req.url || '/', 'https://x').searchParams
    const dry = body.dry === true || body.dry === 1 || q.get('dry') === '1' || q.get('dry') === 'true'
    const action = String(body.action || 'run')
    const rawSource = body.source || q.get('source')
    const source = ['scheduled', 'auto-hourly', 'admin', 'api'].includes(rawSource) ? rawSource : 'scheduled'
    const id = body.id ? String(body.id) : null
    // v49: the admin UI sends the logged-in admin's Supabase JWT instead of a sync token.
    const userJwt = /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(token) ? token : null
    const pTok = userJwt ? null : token
    const call = (fn, args) => rpc(fn, args, userJwt)
    ctx = { pTok, call, source, dry }

    // 1. global switch (also validates the token)
    let settings = await call('mls_sync_get_settings', { p_token: pTok })
    if (!id && typeof body.enabled === 'boolean' && body.enabled !== settings.enabled) {
      settings = await call('mls_sync_set_settings', { p_token: pTok, p_enabled: body.enabled, p_link: null })
    }

    // 2. link management
    if (action === 'link-delete') {
      if (!id) throw fail('id required', 400)
      const n = await call('mls_sync_link_delete', { p_token: pTok, p_id: id })
      return send(res, 200, { ok: true, deleted: n })
    }
    if (action === 'link-delete-all') {
      const n = await call('mls_sync_link_delete_all', { p_token: pTok, p_confirm: String(body.confirm || '') })
      return send(res, 200, { ok: true, deleted: n })
    }
    let added = null
    if (body.link != null && String(body.link).trim()) {
      const n = normalizeAnyLink(body.link)
      if (n.error) throw fail(n.error, 400)
      added = await call('mls_sync_link_save', {
        p_token: pTok,
        p_id: action === 'link-save' ? id : null,
        p_label: body.label != null ? String(body.label) : action === 'link-save' && id ? null : n.label,
        p_url: n.url,
        p_kind: n.kind,
        p_enabled: id ? null : typeof body.linkEnabled === 'boolean' ? body.linkEnabled : true,
      })
    }
    if (action === 'link-save' && id && !added) {
      added = await call('mls_sync_link_save', {
        p_token: pTok,
        p_id: id,
        p_label: body.label != null ? String(body.label) : null,
        p_url: null,
        p_kind: null,
        p_enabled: typeof body.enabled === 'boolean' ? body.enabled : null,
      })
    }

    const rows = await call('mls_sync_links_list', { p_token: pTok })
    const links = (rows || []).map(publicLink)
    const base = { enabled: settings.enabled, links, linkSaved: links.length > 0 }

    if (action === 'status' || action === 'links') {
      return send(res, 200, { ok: true, ...base, lastRunAt: settings.last_run_at, lastResult: settings.last_result })
    }
    if (action === 'save' || action === 'link-save') return send(res, 200, { ok: true, saved: true, link: added ? publicLink(added) : null, ...base })

    // 3. run
    if (!settings.enabled && !dry && source !== 'admin') {
      return send(res, 200, { ok: true, skipped: 'off', message: 'MLS auto-import is switched OFF in Admin.', ...base })
    }
    const targets = (rows || []).filter((l) => (id ? l.id === id : l.enabled))
    if (!targets.length) {
      throw fail(id ? 'Saved link not found.' : 'No MLS link saved (or all links are off). Add one in Admin → MLS auto-import.', 400)
    }

    const perLink = []
    const detailItems = []
    const tot = { new: 0, updated: 0, unchanged: 0, errors: 0, total: 0 }
    for (const l of targets) {
      const pl = publicLink(l)
      const hint = `${l.label || pl.kind} · ${pl.hint}`.slice(0, 120)
      try {
        if (Date.now() - t0 > 48000) throw new Error('Skipped this run (time limit); it will run next hour.')
        const { listings, totalCount, detailCtx } = await fetchLinkListings(l)
        // v67: remember each home's portal id so its details (taxes / HOA) can be fetched after the import
        if (detailCtx) for (const x of listings) if (x && x.Id && x.ListingId) detailItems.push({ id: `mls_${x.ListingId}`, rawId: x.Id, ctx: detailCtx })
        if (!listings.length) throw new Error('The MLS link returned 0 homes.')
        const { homes, skipped, totalRows } = toSyncHomes(listings)
        const r = await call('mls_sync_apply', {
          p_token: pTok,
          p_homes: homes,
          p_dry: dry,
          p_source: source,
          p_link_hint: hint,
          p_skipped: skipped,
        })
        const summary = `${r.new} new, ${r.updated} updated`
        if (!dry) {
          await call('mls_sync_link_set_result', {
            p_token: pTok,
            p_id: l.id,
            p_result: { ok: true, homes: totalRows, new: r.new, updated: r.updated, unchanged: r.unchanged, summary, logId: r.logId },
          })
        }
        for (const k of Object.keys(tot)) tot[k] += Number(r[k]) || 0
        perLink.push({ id: l.id, label: l.label, ok: true, portalTotal: totalCount, homes: totalRows, skippedByMapper: skipped, ...r, summary })
      } catch (err) {
        const message = String(err instanceof Error ? err.message : err).slice(0, 500)
        tot.errors += 1
        perLink.push({ id: l.id, label: l.label, ok: false, error: message })
        try {
          await call('mls_sync_log_error', { p_token: pTok, p_source: source, p_dry: dry, p_message: message, p_link_hint: hint })
          if (!dry) await call('mls_sync_link_set_result', { p_token: pTok, p_id: l.id, p_result: { ok: false, error: message } })
        } catch {
          /* best-effort */
        }
      }
    }
    // v67: taxes + HOA from each home's MLS details page: new homes first, then anything not refreshed in 7 days,
    // as many as fit in this run (about 150 per hour), never blocking the import itself
    let details = null
    if (!dry && detailItems.length && Date.now() - t0 < 40000) {
      try {
        const byId = new Map(detailItems.map((d) => [d.id, d]))
        const todo = await call('mls_sync_details_todo', { p_token: pTok, p_ids: [...byId.keys()], p_limit: 300 })
        const items = (todo || []).map((id) => byId.get(id)).filter(Boolean)
        const rows = await fetchTaxHoa(items, { concurrency: 6, deadline: t0 + 50000 })
        const saved = rows.length ? await call('mls_sync_apply_details', { p_token: pTok, p_rows: rows }) : 0
        details = { due: items.length, fetched: rows.length, saved }
      } catch (err) {
        details = { error: String(err instanceof Error ? err.message : err).slice(0, 200) }
      }
    }
    const allFailed = perLink.every((p) => !p.ok)
    return send(res, allFailed ? 502 : 200, {
      ok: !allFailed,
      dry,
      ...tot,
      summary: `${tot.new} new, ${tot.updated} updated`,
      perLink,
      details,
      ...(allFailed ? { error: perLink.map((p) => `${p.label}: ${p.error}`).join(' | ') } : {}),
      source,
      ms: Date.now() - t0,
      ...base,
      links: undefined,
    })
  } catch (err) {
    if (ctx && Number(err?.status) !== 401 && Number(err?.status) !== 400) {
      try {
        await ctx.call('mls_sync_log_error', {
          p_token: ctx.pTok,
          p_source: ctx.source,
          p_dry: ctx.dry,
          p_message: String(err instanceof Error ? err.message : err).slice(0, 500),
          p_link_hint: null,
        })
      } catch {
        /* best-effort */
      }
    }
    const status = Number(err?.status) || 500
    return send(res, status, { error: err instanceof Error ? err.message : 'mls-sync failed' })
  }
}
