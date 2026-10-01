/**
 * CMA (comparative market analysis) engine — plain JS shared by Vercel api/ and the Vite dev server.
 *
 * Data sources (all public / first-party, no scraping of Zillow/Realtor.com — their terms forbid it):
 *  1. Geocoding: OpenStreetMap Nominatim (fallback: US Census geocoder).
 *  2. Sold comps: CT Office of Policy & Management "Real Estate Sales 2001+" (data.ct.gov 5mzw-sjtu),
 *     official town-clerk recorded sales with coordinates.
 *  3. Property details (beds / baths / living area / assessment): CT GIS Office
 *     "2026 Connecticut Parcel and CAMA Data" (data.ct.gov ibe8-9i3q), falling back to the 2025 file
 *     (rny9-6ak2) — town assessor records. Westchester County NY: NYS ITS tax-parcel centroids and the
 *     Westchester County GIS tax-parcel layer (same ORPTS roll attributes).
 *  Owner names come back from these records for ADMIN use only; runCma returns them under `_private`
 *  and the HTTP handler strips them before replying to site visitors.
 *  4. Active comps: Listing Needed's own Supabase `listings` table (MLS-imported + DIY, for sale, live).
 * Nothing is invented: a comp without a value shows "—", and a failed source is reported in `sources`.
 */

const UA = 'ListingNeeded-CMA/1.0 (+https://www.listingneeded.com; bureauficoaacredit@gmail.com)'
const SALES_URL = 'https://data.ct.gov/resource/5mzw-sjtu.json'
const CAMA_SETS = [
  { url: 'https://data.ct.gov/resource/ibe8-9i3q.json', label: '2026', coOwner: true },
  { url: 'https://data.ct.gov/resource/rny9-6ak2.json', label: '2025', coOwner: false },
]
const NY_ITS_URL = 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcel_Centroid_Points/FeatureServer/0/query'
const NY_COUNTY_URL = 'https://giswww.westchestergov.com/arcgis/rest/services/DataHub_TaxParcels/MapServer/0/query'
const MILE_M = 1609.344

export const MARCEL = {
  name: 'Marcel Najar',
  site: 'www.listingneeded.com',
  phone: '203-818-3242',
  email: 'bureauficoaacredit@gmail.com',
}

export const DISCLAIMER =
  'This is an automated estimate built from public records (Connecticut OPM recorded sales and town assessor ' +
  'CAMA data) plus active listings on Listing Needed. It is not an appraisal and has not been reviewed by a ' +
  'licensed appraiser. Condition, updates, lot, view and current market shifts are not fully captured, and the ' +
  'state sales file lags recent months. For a full CMA from a licensed Realtor®, contact Marcel Najar · ' +
  'www.listingneeded.com · 203-818-3242.'

/* ---------------- validation ---------------- */

export function normalizeUsPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return null
  // NANP: area code and exchange cannot start with 0/1; area code can't be N11
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null
  if (/^[2-9]11/.test(d)) return null
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export function isValidEmail(raw) {
  const e = String(raw || '').trim()
  return e.length <= 320 && /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(e)
}

/* ---------------- helpers ---------------- */

export async function fetchJson(url, { timeoutMs = 9000, headers = {}, ...init } = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 120)}`)
  }
}

export function soql(url, params) {
  const u = new URL(url)
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, String(v))
  return u.toString()
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const pos = (v) => {
  const n = num(v)
  return n != null && n > 0 ? n : null
}

const SUFFIX = {
  ROAD: 'RD', STREET: 'ST', AVENUE: 'AVE', AV: 'AVE', DRIVE: 'DR', LANE: 'LN', COURT: 'CT', PLACE: 'PL',
  TERRACE: 'TER', TERR: 'TER', CIRCLE: 'CIR', BOULEVARD: 'BLVD', HIGHWAY: 'HWY', PARKWAY: 'PKWY',
  TRAIL: 'TRL', EXTENSION: 'EXT', EXTN: 'EXT', TURNPIKE: 'TPKE', TPK: 'TPKE', SQUARE: 'SQ', RIDGE: 'RDG',
  HILL: 'HL', POINT: 'PT', CROSSING: 'XING', COMMONS: 'CMNS', WAY: 'WAY', ROW: 'ROW', PATH: 'PATH',
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', MOUNT: 'MT', SAINT: 'ST', FORT: 'FT',
}

/** Uppercase street name with standard abbreviations and no unit. */
export function normStreet(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\b(UNIT|APT|APARTMENT|STE|SUITE|BLDG|FL)\b.*$/, '')
    .replace(/#.*$/, '')
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIX[w] || w)
    .join(' ')
    .trim()
}

/** "12-14 Main Street Unit 3, Westport, CT 06880" → { number:'12', street:'MAIN ST', unit:'3', town, zip } */
export function parseAddress(input) {
  const raw = String(input || '').trim().replace(/\s+/g, ' ')
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  const line1 = parts[0] || ''
  const m = line1.match(/^(\d+[A-Za-z]?)(?:\s*-\s*\d+[A-Za-z]?)?\s+(.+)$/)
  const unitM = line1.match(/(?:\b(?:unit|apt|apartment|ste|suite)\b\.?\s*|#\s*)([\w-]+)\s*$/i)
  let town = null
  let zip = null
  for (const p of parts.slice(1)) {
    const z = p.match(/\b(\d{5})(?:-\d{4})?\b/)
    if (z) zip = z[1]
    const t = p.replace(/\b(CT|Connecticut)\b/i, '').replace(/\d{5}(-\d{4})?/, '').trim()
    if (t && !town) town = t
  }
  return {
    raw,
    number: m ? m[1].toUpperCase() : null,
    street: m ? normStreet(m[2]) : null,
    unit: unitM ? unitM[1] : null,
    town,
    zip,
  }
}

/** "07-05-2024 12:00:00 AM" | "8/10/2022 0:00" | "2024-07-05..." → "2024-07-05" */
function toIsoDate(s) {
  const t = String(s || '').trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

/** Address line ends in a unit token like "10h", "3B", "Unit 4" → probably a condo/apartment unit. */
function looksLikeUnit(address) {
  const line = String(address || '').split(',')[0].trim()
  if (/\b(unit|apt|apartment|ste|suite)\b|#/i.test(line)) return true
  const toks = line.split(/\s+/)
  return toks.length >= 4 && /^(\d+[a-z]{1,2}|[a-z]\d{0,3})$/i.test(toks[toks.length - 1])
}

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

function haversineMi(a, b) {
  if (!a || !b) return null
  const R = 3958.8
  const toR = (d) => (d * Math.PI) / 180
  const dLat = toR(b.lat - a.lat)
  const dLon = toR(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function quantile(arr, p) {
  const s = arr.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!s.length) return null
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return s[lo] + (s[hi] - s[lo]) * (i - lo)
}
const median = (a) => quantile(a, 0.5)
const mean = (a) => {
  const s = a.filter((x) => Number.isFinite(x))
  return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null
}
const round1k = (n) => (n == null ? null : Math.round(n / 1000) * 1000)

/** Street of a record matches the subject street (tolerant of ROAD/RD etc. and trailing words). */
function sameStreet(a, b) {
  const x = normStreet(a)
  const y = normStreet(b)
  if (!x || !y) return false
  if (x === y) return true
  const xw = x.split(' ')
  const yw = y.split(' ')
  // match on the core name (drop the suffix word) when one side lacks a suffix
  return xw[0] === yw[0] && (xw.length === 1 || yw.length === 1 || xw.slice(0, -1).join(' ') === yw.slice(0, -1).join(' '))
}

/* ---------------- geocoding ---------------- */

async function geocodeNominatim(address) {
  const url = soql('https://nominatim.openstreetmap.org/search', {
    q: address,
    format: 'json',
    addressdetails: 1,
    limit: 1,
    countrycodes: 'us',
  })
  const rows = await fetchJson(url, { timeoutMs: 6000 })
  const r = rows?.[0]
  if (!r) return null
  const a = r.address || {}
  return {
    lat: Number(r.lat),
    lon: Number(r.lon),
    town: a.city || a.town || a.municipality || a.village || a.hamlet || null,
    state: a.state || null,
    county: a.county || null,
    zip: a.postcode || null,
    houseNumber: a.house_number || null,
    road: a.road || null,
    display: r.display_name,
    source: 'OpenStreetMap Nominatim',
  }
}

async function geocodeCensus(address) {
  const url = soql('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress', {
    address,
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'County Subdivisions',
    format: 'json',
  })
  const data = await fetchJson(url, { timeoutMs: 5000 })
  const m = data?.result?.addressMatches?.[0]
  if (!m) return null
  const sub = m.geographies?.['County Subdivisions']?.[0]
  return {
    lat: m.coordinates.y,
    lon: m.coordinates.x,
    town: sub?.BASENAME || m.addressComponents?.city || null,
    state: m.addressComponents?.state === 'CT' ? 'Connecticut' : m.addressComponents?.state,
    zip: m.addressComponents?.zip || null,
    houseNumber: m.addressComponents?.fromAddress || null,
    road: null,
    display: m.matchedAddress,
    source: 'US Census geocoder',
  }
}

export async function geocode(address, notes) {
  const tries = [geocodeNominatim, geocodeCensus]
  for (const fn of tries) {
    try {
      const g = await fn(address)
      if (g && Number.isFinite(g.lat)) return g
    } catch (err) {
      notes.push(`${fn === geocodeNominatim ? 'Nominatim' : 'Census'} geocoder failed: ${err.message}`)
    }
  }
  return null
}

/* ---------------- CT open data ---------------- */

let latestListYearCache = null
async function latestListYear() {
  if (latestListYearCache) return latestListYearCache
  const rows = await fetchJson(soql(SALES_URL, { $select: 'max(listyear) as y, max(daterecorded) as d' }))
  latestListYearCache = { year: Number(rows[0].y), through: rows[0].d }
  return latestListYearCache
}

const urlOf = (v) => {
  const u = typeof v === 'string' ? v : v?.url
  return u && /^https?:/i.test(u) ? u : null
}

function camaFacts(row, label) {
  if (!row) return null
  const baths = pos(row.number_of_baths)
  const half = num(row.number_of_half_baths) || 0
  const owners = [row.owner, row.co_owner].map((x) => String(x || '').trim()).filter(Boolean)
  return {
    state: 'CT',
    location: row.location,
    town: row.property_city,
    beds: pos(row.number_of_bedroom),
    baths: baths != null ? baths + half * 0.5 : null,
    sqft: pos(row.living_area),
    assessed: pos(row.assessed_total),
    appraised: pos(row.appraised_total),
    yearBuilt: pos(row.ayb),
    acres: pos(row.land_acres),
    use: row.state_use_description || null,
    style: row.style_desc || null,
    lastSalePrice: pos(row.sale_price),
    lastSaleDate: row.sale_date || null,
    url: urlOf(row.cama_site_link),
    owners, // admin-only — never sent to visitors
    dataset: `CT CAMA ${label}`,
  }
}

const CAMA_SELECT =
  'location,street_name,address_number,property_city,property_zip,living_area,number_of_bedroom,number_of_baths,number_of_half_baths,assessed_total,appraised_total,ayb,land_acres,state_use_description,style_desc,sale_price,sale_date,cama_site_link,owner'

const leadNum = (n) => {
  const m = String(n || '').match(/^\d+/)
  return m ? Number(m[0]) : null
}

/**
 * Look up CT assessor records for many (number, street) pairs in one town (or by ZIP when town misses).
 * Tries the 2026 dataset first and falls back to 2025 for anything missing / on error.
 * Returns Map key → facts.
 */
async function camaLookup(town, items, { zip } = {}) {
  const out = new Map()
  const usable = items.filter((i) => leadNum(i.number) != null && i.street)
  if (!usable.length || (!town && !zip)) return out
  let lastErr = null
  for (const set of CAMA_SETS) {
    const todo = usable.filter((i) => !out.has(i.key))
    if (!todo.length) break
    try {
      const prefixes = [...new Set(todo.map((i) => `${leadNum(i.number)} ${i.street.split(' ')[0]}`))]
      const chunks = []
      for (let i = 0; i < prefixes.length; i += 25) chunks.push(prefixes.slice(i, i + 25))
      const place = town
        ? `upper(property_city)=${q(String(town).toUpperCase())}`
        : `property_zip like ${q(`${String(zip).replace(/^0+/, '').slice(0, 4)}%`)}`
      const results = await Promise.all(
        chunks.map((chunk) => {
          const ors = chunk.map((p) => `starts_with(upper(location), ${q(p)})`).join(' OR ')
          return fetchJson(
            soql(set.url, {
              $where: `${place} AND (${ors})`,
              $limit: 1000,
              $select: CAMA_SELECT + (set.coOwner ? ',co_owner' : ''),
            }),
          )
        }),
      )
      const rows = results.flat()
      for (const it of todo) {
        const cands = rows.filter(
          (r) =>
            leadNum(r.address_number) === leadNum(it.number) &&
            sameStreet(r.street_name || String(r.location).replace(/^\S+\s+/, ''), it.street),
        )
        if (!cands.length) continue
        let pick = cands[0]
        if (it.unit) {
          const u = cands.find((r) => new RegExp(`(#|UNIT\\s*)${it.unit}\\b`, 'i').test(r.location))
          if (u) pick = u
        } else {
          pick = cands.find((r) => pos(r.living_area)) || pick
        }
        out.set(it.key, camaFacts(pick, set.label))
      }
    } catch (err) {
      lastErr = err
    }
  }
  if (!out.size && lastErr) throw lastErr
  return out
}

/* ---------------- New York (Westchester) parcels ---------------- */

const NY_ITS_TIMEOUT = 7000

async function nyQuery(base, params, { retries = 1, timeoutMs = 8000 } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await fetchJson(soql(base, { outFields: '*', returnGeometry: 'false', f: 'json', ...params }), { timeoutMs })
      if (data?.error) throw new Error(data.error.message || 'ArcGIS error')
      return (data.features || []).map((f) => f.attributes)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`

function nyFacts(r, sourceLabel) {
  const owners = [r.PRIMARY_OWNER, r.ADD_OWNER].map((x) => String(x || '').trim()).filter(Boolean)
  const cls = String(r.PROP_CLASS || '')
  return {
    state: 'NY',
    location: r.PARCEL_ADDR,
    town: r.MUNI_NAME || r.CITYTOWN_NAME || null,
    beds: pos(r.NBR_BEDROOMS),
    baths: pos(r.NBR_FULL_BATHS), // full baths only in the NY roll
    sqft: pos(r.SQFT_LIVING),
    assessed: null,
    marketValue: pos(r.FULL_MARKET_VAL) && pos(r.FULL_MARKET_VAL) >= 50000 ? pos(r.FULL_MARKET_VAL) : null,
    appraised: null,
    yearBuilt: pos(r.YR_BLT),
    acres: pos(r.ACRES) || pos(r.CALC_ACRES),
    use: cls.startsWith('220') ? 'Two Family' : cls.startsWith('230') ? 'Three Family' : null,
    style: r.BLDG_STYLE_DESC || null,
    lastSalePrice: null,
    lastSaleDate: null,
    url: null,
    owners,
    dataset: sourceLabel,
    _geo: { muni: r.MUNI_NAME, city: r.CITYTOWN_NAME, mail: r.MAIL_CITY, zip: r.LOC_ZIP },
  }
}

function pickNyParcel(rows, parsed, { town, zip }) {
  const same = rows.filter((r) => {
    const p = parseAddress(r.PARCEL_ADDR)
    return leadNum(p.number) === leadNum(parsed.number) && sameStreet(p.street, parsed.street)
  })
  if (!same.length) return null
  let c = same
  if (c.length > 1 && zip) {
    const z = c.filter((r) => String(r.LOC_ZIP || '').startsWith(String(zip).slice(0, 5)) || String(r.MAIL_ZIP || '').startsWith(String(zip).slice(0, 5)))
    if (z.length) c = z
  }
  if (c.length > 1 && town) {
    const t = String(town).toUpperCase()
    const m = c.filter((r) => [r.MUNI_NAME, r.CITYTOWN_NAME, r.MAIL_CITY].some((x) => String(x || '').toUpperCase().includes(t) || t.includes(String(x || '').toUpperCase().replace(/^(TOWN|VILLAGE|CITY) OF /, ''))))
    if (m.length) c = m
  }
  if (c.length > 1) {
    c = c.filter((r) => pos(r.SQFT_LIVING)) || c
    if (c.length > 1 && new Set(c.map((r) => `${r.MUNI_NAME}`)).size > 1) return null // ambiguous across towns
  }
  return c[0] || null
}

/**
 * Westchester lookup. Queries the Westchester County GIS layer and NYS ITS parcel service in parallel and
 * uses whichever answers first with a match (ITS is slow / sometimes unreachable). Returns { facts, status[] }.
 */
export async function nyParcelLookup(parsed, { town, zip, only } = {}) {
  const status = []
  if (!parsed.number || !parsed.street) return { facts: null, status }
  const first = parsed.street.split(' ')[0]
  const where = `UPPER(PARCEL_ADDR) LIKE ${sqlStr(`${leadNum(parsed.number)} ${first}%`)}`
  const jobs = []
  if (only !== 'its') {
    jobs.push({ name: 'Westchester County GIS tax parcels', run: () => nyQuery(NY_COUNTY_URL, { where: `${where} AND COUNTY_NAME='Westchester'`, resultRecordCount: 200 }, { retries: 1, timeoutMs: 8000 }) })
  }
  if (only !== 'county') {
    jobs.push({ name: 'NYS ITS tax parcel centroids', run: () => nyQuery(NY_ITS_URL, { where: `${where} AND COUNTY_NAME='Westchester'`, resultRecordCount: 200 }, { retries: 1, timeoutMs: NY_ITS_TIMEOUT }) })
  }
  const t0 = Date.now()
  let winner = null
  await new Promise((resolve) => {
    let pending = jobs.length
    const done = () => {
      pending -= 1
      if (pending <= 0) resolve()
    }
    for (const job of jobs) {
      job
        .run()
        .then((rows) => {
          const pick = pickNyParcel(rows, parsed, { town, zip })
          status.push({ name: job.name, status: pick ? 'ok' : 'no match', detail: `${rows.length} candidate rows in ${Date.now() - t0} ms` })
          if (pick && !winner) {
            winner = nyFacts(pick, job.name)
            resolve()
          }
        })
        .catch((err) => status.push({ name: job.name, status: 'failed', detail: `${err.message} (${Date.now() - t0} ms)` }))
        .finally(done)
    }
  })
  return { facts: winner, status }
}

function propTypeFromUse(use) {
  const u = String(use || '').toLowerCase()
  if (/condo/.test(u)) return 'Condo'
  if (/two|2 fam/.test(u)) return 'Two Family'
  if (/three|3 fam/.test(u)) return 'Three Family'
  if (/four|4 fam/.test(u)) return 'Four Family'
  return 'Single Family'
}

async function soldCandidates(center, propType, listYear, notes) {
  const radii = [1, 2, 3, 5]
  let rows = []
  let usedRadius = null
  for (const mi of radii) {
    const where = [
      `within_circle(geo_coordinates, ${center.lat}, ${center.lon}, ${Math.round(mi * MILE_M)})`,
      `listyear >= ${listYear - 1}`,
      `residentialtype=${q(propType)}`,
      'saleamount >= 30000',
      'nonusecode IS NULL',
    ].join(' AND ')
    rows = await fetchJson(
      soql(SALES_URL, {
        $where: where,
        $limit: 400,
        $select: 'serialnumber,address,town,daterecorded,saleamount,assessedvalue,salesratio,listyear,geo_coordinates',
      }),
    )
    // drop likely non-arm's-length sales (assessment far off the sale price)
    rows = rows.filter((r) => {
      const ratio = num(r.salesratio)
      return ratio == null || (ratio >= 0.2 && ratio <= 1.5)
    })
    usedRadius = mi
    if (rows.length >= 12) break
  }
  if (!rows.length) notes.push(`No recorded ${propType} sales found within ${usedRadius} miles in the last two CT list years.`)
  return { rows, radiusMi: usedRadius }
}

/* ---------------- Listing Needed active listings ---------------- */

function supabaseServerConfig() {
  // Listing Needed's own project + public (anon/publishable) key only — no service-role keys, nothing shared
  // with any other project. Leads are written via the insert-only policy and read via the code-gated RPCs.
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  return { url, key }
}

export function supabaseHeaders(key, extra = {}) {
  const h = { apikey: key, 'Content-Type': 'application/json', ...extra }
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`
  return h
}

async function activeListings(town) {
  const { url, key } = supabaseServerConfig()
  if (!url || !key) throw new Error('Supabase URL/key not configured on the server')
  const path =
    `/rest/v1/listings?type=eq.sale&live=eq.true&paid=eq.true&city=ilike.${encodeURIComponent(town)}` +
    '&select=id,address,city,zip,beds,baths,price,is_mls,active_until&limit=300'
  const rows = await fetchJson(`${url}${path}`, { headers: supabaseHeaders(key), timeoutMs: 6000 })
  const today = new Date().toISOString().slice(0, 10)
  return rows.filter((r) => pos(r.price) && (!r.active_until || r.active_until >= today))
}

/** Coordinates for active listings via their own recorded-sale history in the CT sales file. */
async function coordsFromSalesFile(town, items) {
  const out = new Map()
  const usable = items.filter((i) => i.number && i.street)
  if (!usable.length) return out
  const ors = usable.map((i) => `starts_with(upper(address), ${q(`${i.number} ${i.street.split(' ')[0]}`)})`)
  const rows = await fetchJson(
    soql(SALES_URL, {
      $where: `upper(town)=${q(town.toUpperCase())} AND geo_coordinates IS NOT NULL AND (${ors.join(' OR ')})`,
      $select: 'address,geo_coordinates',
      $limit: 1000,
    }),
  )
  for (const it of usable) {
    const hit = rows.find((r) => {
      const p = parseAddress(r.address)
      return p.number === it.number && sameStreet(p.street, it.street)
    })
    if (hit) out.set(it.key, { lat: hit.geo_coordinates.coordinates[1], lon: hit.geo_coordinates.coordinates[0] })
  }
  return out
}

/* ---------------- main ---------------- */

/**
 * @param {{ address: string, beds?: number, baths?: number, sqft?: number }} input
 */
export async function runCma(input) {
  const notes = []
  const sources = []
  const address = String(input.address || '').trim()
  if (address.length < 5) throw Object.assign(new Error('Enter the full property address.'), { status: 400 })
  const parsed = parseAddress(address)

  /* 1. geocode */
  const wantsNy = /\bNY\b|new york|westchester/i.test(address)
  const geo = await geocode(/\b(CT|NY)\b|connecticut|new york/i.test(address) ? address : `${address}, CT`, notes)
  if (!geo) {
    sources.push({ name: 'Geocoding (OpenStreetMap / US Census)', status: 'failed', detail: 'Address not found' })
    throw Object.assign(new Error('We could not locate that address. Include street number, street, town and CT.'), {
      status: 422,
      sources,
    })
  }
  const isCt = /connecticut/i.test(geo.state || '')
  const isNy = /new york/i.test(geo.state || '')
  if (!isCt && !isNy) {
    throw Object.assign(
      new Error(`This tool covers Connecticut and Westchester County, NY; that address resolved to ${geo.state || 'another state'}.`),
      { status: 422 },
    )
  }
  if (isNy && !/westchester/i.test(geo.county || '') && !wantsNy) {
    throw Object.assign(new Error('For New York this tool covers Westchester County only.'), { status: 422 })
  }
  if (isNy && geo.county && !/westchester/i.test(geo.county)) {
    throw Object.assign(new Error(`For New York this tool covers Westchester County only (that address is in ${geo.county}).`), { status: 422 })
  }
  sources.push({ name: `Geocoding (${geo.source})`, status: 'ok', detail: geo.display })
  const town = titleCase(geo.town || parsed.town || '')
  const center = { lat: geo.lat, lon: geo.lon }
  const subjectNumber = parsed.number || (geo.houseNumber ? String(geo.houseNumber).toUpperCase() : null)
  const subjectStreet = parsed.street || normStreet(geo.road)

  /* 2. subject assessor facts + dataset freshness (parallel) */
  const stateCode = isNy ? 'NY' : 'CT'
  let subjCama = null
  let subjectLookupFailed = null
  const subjectJob = isNy
    ? nyParcelLookup({ ...parsed, number: subjectNumber, street: subjectStreet }, { town, zip: geo.zip || parsed.zip }).then((r) => {
        subjCama = r.facts
        for (const st of r.status) sources.push({ name: `${st.name} (NY tax roll 2025)`, status: st.status, detail: st.detail })
        if (!r.facts) notes.push('No Westchester parcel record matched this address — using the details you entered.')
      })
    : camaLookup(town, [{ key: 'subject', number: subjectNumber, street: subjectStreet, unit: parsed.unit }], { zip: geo.zip }).then((m) => {
        subjCama = m.get('subject') || null
        sources.push({
          name: `CT town assessor records (${subjCama?.dataset || 'CAMA 2026'}, data.ct.gov)`,
          status: subjCama ? 'ok' : 'no match',
          detail: subjCama ? `${subjCama.location}, ${subjCama.town}` : 'Subject not matched; using the details you entered',
        })
      })
  const [camaRes, lyRes] = await Promise.allSettled([subjectJob, isNy ? Promise.reject(new Error('n/a')) : latestListYear()])
  if (camaRes.status === 'rejected') {
    subjectLookupFailed = camaRes.reason?.message
    notes.push(`Assessor lookup failed: ${subjectLookupFailed}`)
    sources.push({ name: isNy ? 'Westchester parcel records' : 'CT town assessor records (data.ct.gov)', status: 'failed', detail: String(subjectLookupFailed || '') })
  }
  const listYear = lyRes.status === 'fulfilled' ? lyRes.value.year : new Date().getFullYear() - 2
  const dataThrough = lyRes.status === 'fulfilled' ? String(lyRes.value.through).slice(0, 10) : null

  const subject = {
    input: address,
    matchedAddress: subjCama ? `${titleCase(subjCama.location)}, ${subjCama.town || town}, ${stateCode}` : geo.display,
    state: stateCode,
    town,
    lat: center.lat,
    lon: center.lon,
    beds: pos(input.beds) ?? subjCama?.beds ?? null,
    baths: pos(input.baths) ?? subjCama?.baths ?? null,
    sqft: pos(input.sqft) ?? subjCama?.sqft ?? null,
    bedsSource: pos(input.beds) ? 'you' : subjCama?.beds ? 'assessor' : null,
    sqftSource: pos(input.sqft) ? 'you' : subjCama?.sqft ? 'assessor' : null,
    propertyType: propTypeFromUse(subjCama?.use),
    style: subjCama?.style || null,
    yearBuilt: subjCama?.yearBuilt || null,
    acres: subjCama?.acres || null,
    assessed: subjCama?.assessed || null,
    appraised: subjCama?.appraised || subjCama?.marketValue || null,
    lastSalePrice: subjCama?.lastSalePrice || null,
    lastSaleDate:
      subjCama?.lastSalePrice && subjCama?.lastSaleDate
        ? toIsoDate(subjCama.lastSaleDate)
        : null,
    assessorUrl: subjCama?.url || null,
  }

  /* 3. sold comps + active comps (parallel) */
  const [soldRes, activeRes] = await Promise.allSettled([
    isNy ? Promise.resolve({ rows: [], radiusMi: null, skipped: true }) : soldCandidates(center, subject.propertyType, listYear, notes),
    town ? activeListings(town) : Promise.resolve([]),
  ])

  let sold = []
  let radiusMi = null
  if (soldRes.status === 'fulfilled' && soldRes.value.skipped) {
    sources.push({
      name: 'Recorded sold prices (New York)',
      status: 'unavailable',
      detail: 'New York has no free public sold-price feed; showing property facts and local Listing Needed listings only',
    })
    notes.push('Sold-price comps are not available for New York from free public data, so no automated value estimate is shown. Contact Marcel for a full CMA.')
  } else if (soldRes.status === 'fulfilled') {
    radiusMi = soldRes.value.radiusMi
    sold = soldRes.value.rows.map((r) => {
      const p = parseAddress(r.address)
      const c = r.geo_coordinates?.coordinates
      return {
        key: `s${r.serialnumber}-${r.address}`,
        number: p.number,
        street: p.street,
        address: titleCase(r.address),
        town: r.town,
        price: pos(r.saleamount),
        date: String(r.daterecorded).slice(0, 10),
        assessedAtSale: pos(r.assessedvalue),
        listYear: Number(r.listyear),
        coords: c ? { lat: c[1], lon: c[0] } : null,
        status: 'Sold',
        source: 'CT recorded sale (OPM)',
      }
    })
    // exclude the subject's own sale from comps
    sold = sold.filter((s) => !(s.number === subjectNumber && sameStreet(s.street, subjectStreet) && s.town.toUpperCase() === town.toUpperCase()))
    for (const s of sold) s.distanceMi = haversineMi(center, s.coords)
    sold.sort((a, b) => a.distanceMi - b.distanceMi)
    sold = sold.slice(0, 40)
    sources.push({
      name: 'CT recorded sales (OPM Real Estate Sales, data.ct.gov)',
      status: sold.length ? 'ok' : 'no match',
      detail: `${sold.length} ${subject.propertyType} sales within ${radiusMi} mi, list years ${listYear - 1}–${listYear}${dataThrough ? `, recorded through ${dataThrough}` : ''}`,
    })
  } else {
    notes.push(`CT sales file failed: ${soldRes.reason?.message}`)
    sources.push({ name: 'CT recorded sales (OPM, data.ct.gov)', status: 'failed', detail: String(soldRes.reason?.message || '') })
  }

  // enrich sold comps with assessor facts, grouped by town
  const byTown = new Map()
  for (const s of sold) {
    if (!byTown.has(s.town)) byTown.set(s.town, [])
    byTown.get(s.town).push(s)
  }
  const enrichRes = await Promise.allSettled([...byTown.entries()].map(([t, items]) => camaLookup(t, items)))
  enrichRes.forEach((r, i) => {
    if (r.status !== 'fulfilled') {
      notes.push(`Assessor details unavailable for ${[...byTown.keys()][i]} comps: ${r.reason?.message}`)
      return
    }
    for (const s of [...byTown.values()][i]) {
      const f = r.value.get(s.key)
      if (f) Object.assign(s, { beds: f.beds, baths: f.baths, sqft: f.sqft, yearBuilt: f.yearBuilt, url: f.url })
    }
  })
  for (const s of sold) s.ppsf = s.price && s.sqft ? s.price / s.sqft : null

  // similarity score: distance + size/bed differences when known
  const score = (c) => {
    let sc = c.distanceMi ?? 3
    if (subject.sqft && c.sqft) sc += Math.min(Math.abs(c.sqft - subject.sqft) / subject.sqft, 1.5) * 1.5
    else if (subject.sqft) sc += 0.4
    if (subject.beds && c.beds) sc += Math.min(Math.abs(c.beds - subject.beds), 3) * 0.25
    return sc
  }
  const soldComps = [...sold].sort((a, b) => score(a) - score(b)).slice(0, 8).sort((a, b) => a.distanceMi - b.distanceMi)

  /* active listings */
  let activeComps = []
  if (activeRes.status === 'fulfilled') {
    let act = activeRes.value.map((r) => {
      const p = parseAddress(r.address)
      return {
        key: `a${r.id}`,
        number: p.number,
        street: p.street,
        unit: p.unit,
        address: r.address,
        town: r.city,
        price: pos(r.price),
        beds: pos(r.beds),
        baths: pos(r.baths),
        status: 'Active',
        source: r.is_mls ? 'Listing Needed (MLS import)' : 'Listing Needed (owner listing)',
        url: `https://www.listingneeded.com/#/listing/${r.id}`,
      }
    })
    if (subject.beds) act = act.filter((a) => !a.beds || Math.abs(a.beds - subject.beds) <= 1)
    act = act.slice(0, 60)
    const [facts, coords] = await Promise.allSettled([camaLookup(town, act), coordsFromSalesFile(town, act.slice(0, 25))])
    for (const a of act) {
      const f = facts.status === 'fulfilled' ? facts.value.get(a.key) : null
      a.propertyType = f?.use ? propTypeFromUse(f.use) : looksLikeUnit(a.address) ? 'Condo' : null
      if (f) {
        a.sqft = f.sqft
        a.beds = a.beds || f.beds
        a.baths = a.baths || f.baths
      }
      const c = coords.status === 'fulfilled' ? coords.value.get(a.key) : null
      a.distanceMi = c ? haversineMi(center, c) : null
      a.ppsf = a.price && a.sqft ? a.price / a.sqft : null
    }
    act = act.filter((a) => !a.propertyType || a.propertyType === subject.propertyType)
    activeComps = act.sort((a, b) => score(a) - score(b)).slice(0, 6)
    sources.push({
      name: 'Listing Needed active listings (Supabase)',
      status: activeComps.length ? 'ok' : 'no match',
      detail: activeComps.length ? `${activeComps.length} active for-sale listings in ${town}` : `No active for-sale listings in ${town} on Listing Needed`,
    })
  } else {
    notes.push(`Active listings failed: ${activeRes.reason?.message}`)
    sources.push({ name: 'Listing Needed active listings (Supabase)', status: 'failed', detail: String(activeRes.reason?.message || '') })
  }

  /* 4. estimate */
  const soldPrices = soldComps.map((c) => c.price).filter(Boolean)
  const ppsfs = soldComps.map((c) => c.ppsf).filter(Boolean)
  const methods = []
  if (subject.sqft && ppsfs.length >= 3) {
    methods.push({
      name: 'Price per sq ft',
      value: median(ppsfs) * subject.sqft,
      low: quantile(ppsfs, 0.25) * subject.sqft,
      high: quantile(ppsfs, 0.75) * subject.sqft,
      detail: `median $${Math.round(median(ppsfs))}/sq ft × ${Math.round(subject.sqft).toLocaleString('en-US')} sq ft (${ppsfs.length} sold comps)`,
    })
  }
  const ratios = soldComps
    .filter((c) => c.assessedAtSale && c.price && c.listYear === listYear)
    .map((c) => c.price / c.assessedAtSale)
  if (subject.assessed && ratios.length >= 3) {
    methods.push({
      name: 'Sale-to-assessment ratio',
      value: median(ratios) * subject.assessed,
      low: quantile(ratios, 0.25) * subject.assessed,
      high: quantile(ratios, 0.75) * subject.assessed,
      detail: `median ${median(ratios).toFixed(2)}× assessment × $${Math.round(subject.assessed).toLocaleString('en-US')} current assessment (${ratios.length} comps)`,
    })
  }
  if (!methods.length && soldPrices.length >= 3) {
    methods.push({
      name: 'Median nearby sale',
      value: median(soldPrices),
      low: quantile(soldPrices, 0.25),
      high: quantile(soldPrices, 0.75),
      detail: `median of ${soldPrices.length} nearby recorded sales (size unknown, no adjustment)`,
    })
  }
  const estimate = methods.length
    ? {
        value: round1k(mean(methods.map((m) => m.value))),
        low: round1k(mean(methods.map((m) => m.low))),
        high: round1k(mean(methods.map((m) => m.high))),
        methods: methods.map((m) => ({ ...m, value: round1k(m.value), low: round1k(m.low), high: round1k(m.high) })),
      }
    : null
  if (!estimate) notes.push('Not enough comparable data for an estimate — comps shown as-is.')

  const activePrices = activeComps.map((c) => c.price).filter(Boolean)
  const stats = {
    soldCount: soldComps.length,
    activeCount: activeComps.length,
    soldAvg: round1k(mean(soldPrices)),
    soldMedian: round1k(median(soldPrices)),
    soldMedianPpsf: ppsfs.length ? Math.round(median(ppsfs)) : null,
    activeAvg: round1k(mean(activePrices)),
    activeMedian: round1k(median(activePrices)),
    radiusMi,
  }

  const clean = (c) => ({
    address: c.address,
    town: c.town,
    status: c.status,
    price: c.price,
    date: c.date || null,
    beds: c.beds ?? null,
    baths: c.baths ?? null,
    sqft: c.sqft ?? null,
    ppsf: c.ppsf ? Math.round(c.ppsf) : null,
    distanceMi: c.distanceMi != null ? Math.round(c.distanceMi * 100) / 100 : null,
    source: c.source,
    url: c.url || null,
  })

  const money = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`)
  const summary = estimate
    ? `Est. ${money(estimate.value)} (range ${money(estimate.low)}–${money(estimate.high)}) · ${stats.soldCount} sold + ${stats.activeCount} active comps · ${subject.matchedAddress}`
    : `No estimate (insufficient comps) · ${stats.soldCount} sold + ${stats.activeCount} active comps · ${subject.matchedAddress}`

  return {
    subject,
    estimate,
    stats,
    comps: [...soldComps.map(clean), ...activeComps.map(clean)],
    sources,
    notes,
    dataThrough,
    summary,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    contact: MARCEL,
    // ADMIN ONLY: stripped by handleCma before anything is returned to the browser.
    _private: { owners: subjCama?.owners || [] },
  }
}

/* ---------------- listing-form autofill ---------------- */

/**
 * Public-record lookup used by the "List your home" form. Returns only facts (never owner names).
 * @param {{ address: string, city?: string, state?: string, zip?: string, only?: string }} input
 */
export async function lookupProperty(input) {
  const address = String(input.address || '').trim().slice(0, 200)
  const parsed = parseAddress(address)
  if (!parsed.number || !parsed.street) {
    return { found: false, reason: 'Type the street number and name to look up public records.' }
  }
  const st = String(input.state || 'CT').trim().toUpperCase().slice(0, 2)
  const city = String(input.city || '').trim().slice(0, 80)
  const zip = String(input.zip || '').trim().slice(0, 10)
  const item = { key: 'subject', number: parsed.number, street: parsed.street, unit: parsed.unit }
  const sources = []
  let facts = null
  try {
    if (st === 'CT') {
      let m = city ? await camaLookup(city, [item]) : new Map()
      if (!m.get('subject') && zip) m = await camaLookup(null, [item], { zip })
      facts = m.get('subject') || null
      sources.push({ name: 'CT town assessor records (data.ct.gov)', status: facts ? 'ok' : 'no match' })
    } else if (st === 'NY') {
      const r = await nyParcelLookup(parsed, { town: city, zip, only: input.only })
      facts = r.facts
      sources.push(...r.status)
    } else {
      return { found: false, reason: 'Public-record autofill covers Connecticut and Westchester County, NY.' }
    }
  } catch (err) {
    return { found: false, reason: 'Public records are unavailable right now — enter the details yourself.', error: err.message, sources }
  }
  if (!facts || !(facts.beds || facts.baths || facts.sqft || facts.yearBuilt)) {
    return { found: false, reason: 'No public record found for that address — enter the details yourself.', sources }
  }
  return {
    found: true,
    beds: facts.beds,
    baths: facts.baths,
    sqft: facts.sqft,
    yearBuilt: facts.yearBuilt,
    matchedAddress: `${titleCase(facts.location)}, ${facts.town || city}, ${st}`,
    source: facts.dataset,
    sources,
  }
}
