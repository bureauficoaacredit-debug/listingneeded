/**
 * v76: coordinates for the map, no AI and no keys. U.S. Census Geocoder batch API (free, public domain), with the
 * home's ZIP centroid (2024 Census Gazetteer, bundled in acsZcta2024.json) as the fallback. Works for any US state.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let zcta = null
function zipCentroid(zip) {
  if (!zcta) zcta = require('./acsZcta2024.json')
  const z = String(zip || '').match(/\d{5}/)?.[0]
  const r = z && zcta.data[z]
  if (!r) return null
  const i = zcta.cols.indexOf('lat'), j = zcta.cols.indexOf('lon')
  return r[i] != null && r[j] != null ? { lat: Number(r[i]), lng: Number(r[j]) } : null
}

/** Street without unit/apt part, so the Census finds the building. */
export function cleanStreet(a) {
  return String(a || '')
    .replace(/,?\s*(?:unit|apt|apartment|suite|ste|fl|floor|bldg|building)\.?\s*#?\s*[\w-]+\s*$/i, '')
    .replace(/,?\s*#\s*[\w-]+\s*$/, '')
    .replace(/[",]/g, ' ').replace(/\s+/g, ' ').trim()
}
const csv = (s) => `"${String(s ?? '').replace(/"/g, '').trim()}"`

function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out
}

/** rows: [{id,address,city,state,zip}] (up to ~1000 per call) -> [{id,lat,lng,src}] with src 'address' | 'zip' | 'none'. */
export async function geocodeRows(rows, { timeoutMs = 45000 } = {}) {
  const found = new Map()
  if (rows.length) {
    const body = rows.map((r, i) => [i, csv(cleanStreet(r.address)), csv(r.city), csv(r.state || 'CT'), csv(String(r.zip || '').match(/\d{5}/)?.[0] || '')].join(',')).join('\n')
    try {
      const fd = new FormData()
      fd.append('addressFile', new Blob([body], { type: 'text/csv' }), 'a.csv')
      fd.append('benchmark', 'Public_AR_Current')
      const res = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: fd, signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) {
        for (const line of (await res.text()).split(/\r?\n/)) {
          const c = parseCsvLine(line)
          if (c[2] !== 'Match' || !c[5]) continue
          const [lng, lat] = c[5].split(',').map(Number)
          if (Number.isFinite(lat) && Number.isFinite(lng)) found.set(Number(c[0]), { lat, lng })
        }
      }
    } catch {
      /* Census down or slow: ZIP centroids below; these homes are tried again next run only if no ZIP either */
    }
  }
  return rows.map((r, i) => {
    const a = found.get(i)
    if (a) return { id: r.id, ...a, src: 'address' }
    const z = zipCentroid(r.zip)
    return z ? { id: r.id, ...z, src: 'zip' } : { id: r.id, lat: null, lng: null, src: 'none' }
  })
}
