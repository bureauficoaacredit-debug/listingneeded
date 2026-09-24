/**
 * SMART MLS shared-link → MlsDraft[] mapping (Node / Vercel).
 * Fetches https://smartmls-apiserver.connectmls.com/api/shared-link/<uuid>
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SKIP_STATUS_RE = /\b(CLSD|CLOSED|SOLD|WITHDRAWN|EXPIRED|CANCEL)\b/i
const RENT_HINT_RE = /\b(rent|rental|lease)\b/i

const CT_CITY_ZIP = {
  stamford: '06902',
  bridgeport: '06604',
  fairfield: '06824',
  'new haven': '06511',
  westport: '06880',
  'new canaan': '06840',
  guilford: '06437',
  brookfield: '06804',
  bethel: '06801',
  darien: '06820',
  bethlehem: '06751',
  norwalk: '06851',
  trumbull: '06611',
  shelton: '06484',
  milford: '06460',
  stratford: '06615',
  greenwich: '06830',
  danbury: '06810',
  ridgefield: '06877',
  wilton: '06897',
  weston: '06883',
  easton: '06612',
  monroe: '06468',
}

const ALLOWED_HOSTS = new Set([
  'smartmls-portal.connectmls.com',
  'www.smartmls-portal.connectmls.com',
])

/**
 * Extract a shared-link UUID from a portal URL, API URL, or bare UUID.
 * @param {string} raw
 * @returns {{ uuid: string } | { error: string }}
 */
export function extractSharedLinkUuid(raw) {
  const input = String(raw || '').trim()
  if (!input) return { error: 'Paste a SMART MLS shared-link URL.' }

  if (UUID_RE.test(input)) {
    return { uuid: input.toLowerCase() }
  }

  let url
  try {
    url = new URL(input)
  } catch {
    return {
      error:
        'Invalid URL. Expected a link like https://smartmls-portal.connectmls.com/shared-link/.../<uuid>',
    }
  }

  const host = url.hostname.toLowerCase()
  if (host === 'smartmls-apiserver.connectmls.com') {
    const m = url.pathname.match(/\/api\/shared-link\/([0-9a-f-]{36})\/?$/i)
    if (m && UUID_RE.test(m[1])) return { uuid: m[1].toLowerCase() }
    return { error: 'API URL must end with /api/shared-link/<uuid>.' }
  }

  if (!ALLOWED_HOSTS.has(host)) {
    return {
      error:
        'URL host must be smartmls-portal.connectmls.com (public shared link).',
    }
  }

  const parts = url.pathname.split('/').filter(Boolean)
  // /shared-link/:permalink/:publicId
  if (parts[0] !== 'shared-link' || parts.length < 2) {
    return {
      error:
        'URL path must be /shared-link/<permalink>/<uuid>.',
    }
  }
  const candidate = parts[parts.length - 1]
  if (!UUID_RE.test(candidate)) {
    return {
      error: 'Could not find a valid shared-link UUID at the end of the URL.',
    }
  }
  return { uuid: candidate.toLowerCase() }
}

function parseMlsNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return null
  const asInt = String(Number(digits))
  if (!Number.isFinite(Number(digits)) || asInt === 'NaN') return null
  return asInt
}

function parseBaths(full, half) {
  const f = Number(full) || 0
  const h = Number(half) || 0
  return f + 0.5 * h
}

function zipForCity(city, zipCol) {
  const fromCol = String(zipCol || '')
    .replace(/\D/g, '')
    .slice(0, 5)
  if (fromCol.length === 5) return fromCol
  const key = String(city || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return CT_CITY_ZIP[key] || ''
}

/**
 * Type from property type/class only — not list price.
 * Rentals (RN / "Residential Rental" / etc.) → rent; everything else → sale.
 */
export function listingTypeFromProperty(propertyType, propertyTypeDescription, propertySubTypeDescription) {
  const blob = `${propertyType || ''} ${propertyTypeDescription || ''} ${propertySubTypeDescription || ''}`
  if (RENT_HINT_RE.test(blob)) return 'rent'
  const code = String(propertyType || '').trim().toUpperCase()
  if (code === 'RN') return 'rent'
  return 'sale'
}

function cleanAddress(raw) {
  return String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

function photoUrlsFromListing(L) {
  const mid = Array.isArray(L.ListingPhotosMidsize) ? L.ListingPhotosMidsize : []
  const hd = Array.isArray(L.ListingPhotosHDsize) ? L.ListingPhotosHDsize : []
  // Prefer HD when present; otherwise midsize. Deduplicate.
  const src = hd.length ? hd : mid
  const urls = []
  for (const u of src) {
    const s = String(u || '').trim()
    if (/^https?:\/\//i.test(s) && !urls.includes(s)) urls.push(s)
  }
  return urls
}

/**
 * Map one SMART MLS shared-link listing object → draft or skip reason.
 */
export function sharedListingToDraft(L, index) {
  const mlsNum = parseMlsNumber(L?.ListingId)
  if (!mlsNum) return 'no_mls'

  const status = String(L?.MlsStatus || L?.MlsStatusDisplay || '').trim()
  if (SKIP_STATUS_RE.test(status)) return 'bad_status'

  const propertyType = String(L?.PropertyTypeDescription || L?.PropertyType || '').trim()
  const style = String(
    L?.PropertySubTypeDescription || L?.PropertySubType || '',
  ).trim()
  const type = listingTypeFromProperty(
    L?.PropertyType,
    L?.PropertyTypeDescription,
    L?.PropertySubTypeDescription,
  )

  const price = Number(L?.ListPrice)
  const safePrice = Number.isFinite(price) ? price : 0
  const city = String(L?.City || '').trim()
  const zip = zipForCity(city, L?.Zip)
  const sqft = L?.SquareFeet != null && L.SquareFeet !== '' ? String(L.SquareFeet) : ''
  const year = L?.YearBuilt != null && L.YearBuilt !== '' ? String(L.YearBuilt) : ''
  const state = String(L?.State || 'CT').trim().toUpperCase().slice(0, 2) || 'CT'

  const parts = [
    `MLS #${mlsNum}`,
    status || null,
    propertyType || null,
    style || null,
    sqft ? `${sqft} sq ft` : null,
    year ? `Built ${year}` : null,
  ].filter(Boolean)
  const remarks = String(L?.Remarks || '').replace(/\s+/g, ' ').trim()
  let description = parts.join(' · ')
  if (remarks) {
    description = description ? `${description} — ${remarks}` : remarks
    if (description.length > 1200) description = description.slice(0, 1197) + '...'
  }

  return {
    key: `mls_${mlsNum}_${index}`,
    id: `mls_${mlsNum}`,
    type,
    address: cleanAddress(L?.StreetAddress),
    city,
    state,
    zip,
    beds: Number(L?.BedroomsTotal) || 0,
    baths: parseBaths(L?.BathroomsFull, L?.BathroomsHalf),
    price: safePrice,
    pets: 'no',
    description,
    include: true,
    photoDataUrls: photoUrlsFromListing(L),
  }
}

/**
 * @param {unknown} payload API JSON ({ Listings: [...] } or array)
 */
export function listingsPayloadToDrafts(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.Listings)
      ? payload.Listings
      : null
  if (!list) {
    throw new Error('SMART MLS response missing Listings array.')
  }

  const drafts = []
  let skippedNoMls = 0
  let skippedStatus = 0
  for (let i = 0; i < list.length; i++) {
    const result = sharedListingToDraft(list[i], i)
    if (result === 'no_mls') {
      skippedNoMls += 1
      continue
    }
    if (result === 'bad_status') {
      skippedStatus += 1
      continue
    }
    drafts.push(result)
  }
  return {
    drafts,
    skippedNoMls,
    skippedStatus,
    totalRows: list.length,
  }
}

/**
 * Fetch + normalize a shared link by UUID.
 * @param {string} uuid
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function fetchSharedLinkDrafts(uuid, opts = {}) {
  if (!UUID_RE.test(uuid)) {
    throw new Error('Invalid shared-link UUID.')
  }
  const fetchImpl = opts.fetchImpl || fetch
  const apiUrl = `https://smartmls-apiserver.connectmls.com/api/shared-link/${uuid}`
  let res
  try {
    res = await fetchImpl(apiUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
  } catch (err) {
    throw new Error(
      `Could not reach SMART MLS API: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (res.status === 404) {
    throw new Error('Shared link not found (expired or invalid UUID).')
  }
  if (!res.ok) {
    throw new Error(`SMART MLS API returned HTTP ${res.status}.`)
  }
  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('SMART MLS API returned non-JSON.')
  }
  const parsed = listingsPayloadToDrafts(data)
  if (!parsed.drafts.length) {
    throw new Error(
      `No publishable listings (${parsed.totalRows} row(s); skipped no-MLS: ${parsed.skippedNoMls}, closed/sold/etc: ${parsed.skippedStatus}).`,
    )
  }
  return { ...parsed, uuid, source: 'shared-link' }
}
