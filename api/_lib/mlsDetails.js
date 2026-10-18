/**
 * v67: annual taxes + HOA / common charges from the SMART MLS listing-details payload (the list endpoints leave
 * Taxes empty and give HOA without a frequency). Portal links: POST listingdetails/<Id> with the portal token.
 * Shared links: GET shared-link/<uuid>/<Id> (public).
 */
const API = 'https://smartmls-apiserver.connectmls.com/api/'

async function timedFetch(url, opts = {}, ms = 12000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ac.signal })
  } finally {
    clearTimeout(t)
  }
}

/** Every {Id, Value} field anywhere in the details payload, keyed by Id (first non-empty value wins). */
export function detailFields(payload) {
  const out = {}
  const walk = (o) => {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o)) return o.forEach(walk)
    if (typeof o.Id === 'string' && 'Value' in o && o.Value != null && String(o.Value).trim() !== '' && !(o.Id in out)) {
      out[o.Id] = String(o.Value).trim()
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v)
  }
  walk(payload)
  return out
}

/** Dollar amount, or null for blanks and the placeholders agents type when they don't know (1, 999999, 9999999). */
function money(v, min) {
  if (v == null) return null
  const raw = String(v).replace(/[$,\s]/g, '')
  const n = Number(raw)
  if (!Number.isFinite(n) || n < min || n >= 10_000_000) return null
  if (n >= 9999 && /^9+(\.9+)?$/.test(raw)) return null
  return Math.round(n * 100) / 100
}

const FREQ = [
  [/^month|^mo$|monthly/i, 'month'],
  [/quarter/i, 'quarter'],
  [/semi|half/i, 'half-year'],
  [/annual|year/i, 'year'],
  [/week/i, 'week'],
]

/** { taxes_annual, tax_year, hoa_fee, hoa_frequency } from a details payload; nulls when the MLS has nothing. */
export function taxHoaFromDetails(payload) {
  const f = detailFields(payload)
  const taxes = money(f.PROPERTYTAX, 100)
  let year = f.TAXYEAR ? parseInt(String(f.TAXYEAR).replace(/\D/g, ''), 10) : NaN
  if (Number.isFinite(year) && year < 100) year += 2000
  const taxYear = Number.isFinite(year) && year >= 1990 && year <= 2100 ? year : null
  const hoaYes = !/^n/i.test(f.HOAYN || '')
  const hoa = hoaYes ? money(f.HOAFEEAMOUNT, 10) : null
  let freq = null
  if (hoa != null && f.HOAFEEFREQUENCY) {
    const hit = FREQ.find(([re]) => re.test(f.HOAFEEFREQUENCY))
    freq = hit ? hit[1] : String(f.HOAFEEFREQUENCY).toLowerCase().slice(0, 20)
  }
  return { taxes_annual: taxes, tax_year: taxes != null ? taxYear : null, hoa_fee: hoa, hoa_frequency: freq }
}

/** Details payload of one listing (raw.Id = the portal GUID). ctx: { token } (portal) or { uuid } (shared link). */
export async function fetchListingDetails(rawId, ctx) {
  const res = ctx.token
    ? await timedFetch(`${API}listingdetails/${encodeURIComponent(rawId)}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.token}` },
        body: '{}',
      })
    : await timedFetch(`${API}shared-link/${encodeURIComponent(ctx.uuid)}/${encodeURIComponent(rawId)}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`details HTTP ${res.status}`)
  return res.json()
}

/**
 * Fetch details for many listings with limited parallelism until `deadline` (ms timestamp).
 * items: [{ id: 'mls_123', rawId, ctx }]. Returns [{ id, taxes_annual, tax_year, hoa_fee, hoa_frequency }].
 */
export async function fetchTaxHoa(items, { concurrency = 6, deadline = Infinity } = {}) {
  const out = []
  let i = 0
  let failures = 0
  async function worker() {
    while (i < items.length && Date.now() < deadline && failures < 10) {
      const it = items[i++]
      try {
        out.push({ id: it.id, ...taxHoaFromDetails(await fetchListingDetails(it.rawId, it.ctx)) })
      } catch {
        failures++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return out
}
