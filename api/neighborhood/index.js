/**
 * GET /api/neighborhood?zip=06824[&address=1000 Post Rd&city=Fairfield&state=CT]
 * v52 "Neighborhood facts" for a listing's ZIP (ZCTA). Public records only:
 *  - U.S. Census Bureau ACS 2020-2024 5-year (bundled from the official summary file, keyless): median household income,
 *    owner- vs renter-occupied homes, median home value, median gross rent.
 *  - NCES EDGE public school locations 2024-25 (official no-key ArcGIS service): nearest open regular public schools,
 *    grade span, straight-line distance from the home (Census geocoder) or from the ZIP center.
 * No ratings, crime, poverty or demographic data (fair housing). Cached at the CDN for 30 days.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ACS = require('../_lib/acsZcta2024.json')

export const config = { maxDuration: 20 }

const NCES =
  'https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_ADMINDATA_PUBLICSCH_2425/MapServer/1/query'
const GEOCODER = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'

function send(res, status, payload, cacheSeconds) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Cache-Control',
    cacheSeconds ? `public, max-age=3600, s-maxage=${cacheSeconds}, stale-while-revalidate=604800` : 'no-store',
  )
  res.statusCode = status
  res.end(JSON.stringify(payload))
}

async function getJson(url, ms = 7000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'listingneeded.com neighborhood facts' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}

function miles(lat1, lon1, lat2, lon2) {
  const R = 3958.8
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Unit / apt parts make the Census geocoder miss; drop them (same idea as the map pin). */
function cleanStreet(s) {
  return String(s || '')
    .replace(/,?\s*(?:unit|apt|apartment|suite|ste|fl|floor)\.?\s*#?\s*[\w-]+\s*$/i, '')
    .replace(/,?\s*#\s*[\w-]+\s*$/, '')
    .trim()
}

async function geocode(address, city, state, zip) {
  const street = cleanStreet(address)
  if (!street) return null
  const one = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  try {
    const d = await getJson(`${GEOCODER}?address=${encodeURIComponent(one)}&benchmark=Public_AR_Current&format=json`, 6000)
    const m = d?.result?.addressMatches?.[0]
    if (!m?.coordinates) return null
    const mz = m.addressComponents?.zip
    if (zip && mz && mz !== zip) return null // matched a different town; fall back to ZIP center
    return { lat: m.coordinates.y, lon: m.coordinates.x }
  } catch {
    return null
  }
}

const GRADE = { PK: 'Pre-K', KG: 'K', UG: 'Ungraded', AE: 'Adult' }
function grade(g) {
  if (!g || g === 'N' || g === 'M') return ''
  return GRADE[g] || String(Number(g))
}

async function nearbySchools(lat, lon) {
  for (const radius of [3, 6, 12]) {
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      distance: String(radius),
      units: 'esriSRUnit_StatuteMile',
      where: "SY_STATUS_TEXT='Open' AND SCHOOL_TYPE_TEXT='Regular School'",
      outFields: 'NCESSCH,SCH_NAME,GSLO,GSHI,LCITY,LATCOD,LONCOD,VIRTUAL',
      returnGeometry: 'false',
      resultRecordCount: '200',
      f: 'json',
    })
    const d = await getJson(`${NCES}?${params}`, 8000)
    if (d.error) throw new Error(d.error.message || 'NCES error')
    const list = (d.features || [])
      .map((f) => f.attributes)
      .filter((a) => a && a.SCH_NAME && a.VIRTUAL !== 'Full Virtual' && a.LATCOD && a.LONCOD)
      .map((a) => {
        const lo = grade(a.GSLO)
        const hi = grade(a.GSHI)
        return {
          name: a.SCH_NAME,
          grades: lo && hi ? (lo === hi ? lo : `${lo}–${hi}`) : lo || hi,
          city: a.LCITY ? String(a.LCITY).replace(/\b\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()) : '',
          miles: Math.round(miles(lat, lon, a.LATCOD, a.LONCOD) * 10) / 10,
        }
      })
      .sort((a, b) => a.miles - b.miles)
    if (list.length >= 3 || radius === 12) return list.slice(0, 5)
  }
  return []
}

function pct(part, total) {
  return total > 0 && part != null ? Math.round((part / total) * 1000) / 10 : null
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {}, 0)
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' }, 0)
  const url = new URL(req.url, 'http://x')
  const zip = (url.searchParams.get('zip') || '').trim().slice(0, 5)
  if (!/^\d{5}$/.test(zip)) return send(res, 400, { found: false, reason: 'zip required' }, 0)

  const row = ACS.data[zip]
  const [income, occupied, owner, renter, value, rent, zlat, zlon] = row || []
  const census = row
    ? {
        release: ACS.release,
        medianIncome: income ?? null,
        incomeTopCoded: income != null && income >= 250001,
        ownerPct: pct(owner, occupied),
        renterPct: pct(renter, occupied),
        occupiedHomes: occupied ?? null,
        medianValue: value ?? null,
        valueTopCoded: value != null && value >= 2000001,
        medianRent: rent ?? null,
        rentTopCoded: rent != null && rent >= 3501,
      }
    : null

  let schools = []
  let from = null
  try {
    const home = await geocode(
      url.searchParams.get('address'),
      url.searchParams.get('city'),
      url.searchParams.get('state'),
      zip,
    )
    const pt = home || (zlat != null && zlon != null ? { lat: zlat, lon: zlon } : null)
    if (pt) {
      from = home ? 'home' : 'zip'
      schools = await nearbySchools(pt.lat, pt.lon)
    }
  } catch (err) {
    console.error('neighborhood schools failed:', err?.message || err)
    schools = []
  }

  const found = !!census || schools.length > 0
  // full 30-day CDN cache when everything came back; short cache if the school service hiccupped
  const cache = !found ? 3600 : schools.length ? 2592000 : 21600
  return send(
    res,
    200,
    {
      found,
      zip,
      census,
      schools,
      schoolsDistanceFrom: from,
      schoolsSource: 'NCES EDGE public school locations 2024-25',
    },
    cache,
  )
}
