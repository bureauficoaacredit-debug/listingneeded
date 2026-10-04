import { getConfig, supabaseFetch, throwIfNotOk } from './supabase'
import { isActiveUntilOk, type Listing, type ListingType, type PartnerLink, type PartnerCategory } from './types'

/** DB row shape (snake_case) */
type ListingRow = {
  id: string
  type: ListingType
  address: string
  city: string
  state: string
  zip: string
  beds: number
  baths: number
  price: number
  pets: Listing['pets']
  description: string
  photo_urls: string[] | null
  owner_name: string
  owner_phone: string
  owner_email: string
  created_at: string
  paid: boolean
  live: boolean
  is_mls?: boolean | null
  active_until?: string | null
  sqft?: number | null
  year_built?: number | null
  deleted_at?: string | null
}

function rowToListing(row: ListingRow): Listing {
  return {
    id: row.id,
    type: row.type,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    beds: Number(row.beds),
    baths: Number(row.baths),
    price: Number(row.price),
    pets: row.pets,
    description: row.description ?? '',
    photoDataUrls: row.photo_urls ?? [],
    ownerName: row.owner_name,
    ownerPhone: row.owner_phone,
    ownerEmail: row.owner_email,
    createdAt: row.created_at,
    paid: row.paid,
    live: row.live,
    is_mls: row.is_mls ?? false,
    activeUntil: row.active_until ?? null,
    sqft: row.sqft != null ? Number(row.sqft) : null,
    yearBuilt: row.year_built != null ? Number(row.year_built) : null,
    deletedAt: row.deleted_at ?? null,
  }
}

function listingToRow(listing: Listing): Omit<ListingRow, 'created_at'> & { created_at?: string } {
  return {
    id: listing.id,
    type: listing.type,
    address: listing.address,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
    beds: listing.beds,
    baths: listing.baths,
    price: listing.price,
    pets: listing.pets,
    description: listing.description,
    photo_urls: listing.photoDataUrls,
    owner_name: listing.ownerName,
    owner_phone: listing.ownerPhone,
    owner_email: listing.ownerEmail,
    created_at: listing.createdAt,
    paid: listing.paid,
    live: listing.live,
    is_mls: listing.is_mls ?? false,
    active_until: listing.activeUntil ?? null,
    deleted_at: null, // (re)importing or adding a listing always makes it active, never trashed
    // only sent when known so MLS upserts never blank out a value
    ...(listing.sqft != null ? { sqft: listing.sqft } : {}),
    ...(listing.yearBuilt != null ? { year_built: listing.yearBuilt } : {}),
  }
}

/** Local calendar date as YYYY-MM-DD (matches isActiveUntilOk). */
export function todayYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** YYYY-MM-DD plus N days (local). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return todayYmd(dt)
}

/** Public Search feed: paid + live, not trashed, and active_until not past (filtered in the query AND client-side). */
export async function liveListings(): Promise<Listing[]> {
  // PostgREST caps one response at 1000 rows — page so every live listing shows up on Search.
  const PAGE = 1000
  const all: ListingRow[] = []
  for (let offset = 0; offset < 50000; offset += PAGE) {
    const res = await supabaseFetch(
      `/rest/v1/listings?live=eq.true&paid=eq.true&deleted_at=is.null` +
        `&or=(active_until.is.null,active_until.gte.${todayYmd()})` +
        `&order=created_at.desc,id.asc&limit=${PAGE}&offset=${offset}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    await throwIfNotOk(res)
    const data = (await res.json()) as ListingRow[]
    all.push(...data)
    if (data.length < PAGE) break
  }
  return all.map(rowToListing).filter((l) => !l.deletedAt && isActiveUntilOk(l.activeUntil))
}

export async function getListing(id: string): Promise<Listing | null> {
  const res = await supabaseFetch(`/rest/v1/listings?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  await throwIfNotOk(res)
  const data = (await res.json()) as ListingRow[]
  if (!data.length) return null
  const l = rowToListing(data[0])
  return l.deletedAt ? null : l
}

/** Upload image files to the public listing-photos bucket; returns public URLs. */
export async function uploadListingPhotos(listingId: string, files: File[]): Promise<string[]> {
  const { url } = getConfig()
  const urls: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${listingId}/${i}-${Date.now()}.${ext}`
    // JPEG, PNG, and WebP are the formats supported by the listing UI. Some
    // browsers leave File.type empty, so use JPEG as a safe storage default.
    const contentType = file.type || 'image/jpeg'

    try {
      const res = await supabaseFetch(`/storage/v1/object/listing-photos/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'x-upsert': 'false',
          'cache-control': '3600',
        },
        body: file,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.warn('Photo upload failed, skipping:', text || res.statusText)
        continue
      }
      urls.push(`${url}/storage/v1/object/public/listing-photos/${path}`)
    } catch (err) {
      console.warn('Photo upload failed, skipping:', err)
    }
  }

  if (files.length > 0 && urls.length === 0) {
    throw new Error('Could not upload photos. Try JPG or PNG.')
  }

  return urls
}

export async function insertListing(input: Listing): Promise<Listing> {
  const [listing] = await withAutoExpiry([input])
  const row = listingToRow(listing)
  const res = await supabaseFetch('/rest/v1/listings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  await throwIfNotOk(res)
  const data = (await res.json()) as ListingRow[]
  if (!data.length) throw new Error('Insert returned no row')
  return rowToListing(data[0])
}

/** Bulk insert (admin PDF publish). Inserts one-by-one so a single failure does not drop the batch. */
export async function insertListings(listings: Listing[]): Promise<{ ok: Listing[]; failed: { listing: Listing; error: string }[] }> {
  const ok: Listing[] = []
  const failed: { listing: Listing; error: string }[] = []
  for (const listing of listings) {
    try {
      ok.push(await insertListing(listing))
    } catch (err) {
      failed.push({
        listing,
        error: err instanceof Error ? err.message : 'Insert failed',
      })
    }
  }
  return { ok, failed }
}

/**
 * Admin MLS Excel publish: upsert in batches (~100) on primary key `id`
 * (PostgREST Prefer: resolution=merge-duplicates). Re-imports update instead of duplicating.
 * onProgress(done, total) is called after each batch.
 */
export async function upsertListings(
  listings: Listing[],
  opts?: {
    batchSize?: number
    onProgress?: (done: number, total: number) => void
  },
): Promise<{ ok: Listing[]; failed: { listing: Listing; error: string }[] }> {
  const batchSize = Math.max(1, opts?.batchSize ?? 100)
  listings = await withAutoExpiry(listings)
  const ok: Listing[] = []
  const failed: { listing: Listing; error: string }[] = []
  const total = listings.length

  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize)
    const rows = batch.map((l) => listingToRow(l))
    try {
      const res = await supabaseFetch('/rest/v1/listings?on_conflict=id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(rows),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        // Fall back to one-by-one upsert so a single bad row does not drop the batch.
        for (const listing of batch) {
          try {
            const one = await upsertListing(listing)
            ok.push(one)
          } catch (err) {
            failed.push({
              listing,
              error: err instanceof Error ? err.message : text || 'Upsert failed',
            })
          }
        }
      } else {
        const data = (await res.json()) as ListingRow[]
        if (Array.isArray(data) && data.length) {
          for (const row of data) ok.push(rowToListing(row))
        } else {
          // Some PostgREST configs return empty representation; treat as success by id
          for (const listing of batch) ok.push(listing)
        }
      }
    } catch (err) {
      for (const listing of batch) {
        try {
          ok.push(await upsertListing(listing))
        } catch (inner) {
          failed.push({
            listing,
            error: inner instanceof Error ? inner.message : err instanceof Error ? err.message : 'Upsert failed',
          })
        }
      }
    }
    opts?.onProgress?.(Math.min(i + batch.length, total), total)
  }

  return { ok, failed }
}

async function upsertListing(listing: Listing): Promise<Listing> {
  const row = listingToRow(listing)
  const res = await supabaseFetch('/rest/v1/listings?on_conflict=id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  })
  await throwIfNotOk(res)
  const data = (await res.json()) as ListingRow[]
  if (Array.isArray(data) && data.length) return rowToListing(data[0])
  return listing
}


export async function markPaidAndLive(id: string): Promise<Listing | null> {
  const res = await supabaseFetch(`/rest/v1/listings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ paid: true, live: true }),
  })
  await throwIfNotOk(res)
  const data = (await res.json()) as ListingRow[]
  if (!data.length) return null
  return rowToListing(data[0])
}

export async function updateListingPhotos(id: string, photoUrls: string[]): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/listings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ photo_urls: photoUrls }),
  })
  await throwIfNotOk(res)
}

export type ListingPatch = Partial<{
  live: boolean
  paid: boolean
  activeUntil: string | null
  type: ListingType
  address: string
  city: string
  state: string
  zip: string
  beds: number
  baths: number
  price: number
  pets: Listing['pets']
  description: string
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  is_mls: boolean
  sqft: number | null
  yearBuilt: number | null
}>

/** Admin: patch listing fields (live toggle, active_until, etc.). */
export async function updateListing(id: string, patch: ListingPatch): Promise<Listing> {
  const body: Record<string, unknown> = {}
  if (patch.live != null) body.live = patch.live
  if (patch.paid != null) body.paid = patch.paid
  if (patch.activeUntil !== undefined) body.active_until = patch.activeUntil || null
  if (patch.type != null) body.type = patch.type
  if (patch.address != null) body.address = patch.address
  if (patch.city != null) body.city = patch.city
  if (patch.state != null) body.state = patch.state
  if (patch.zip != null) body.zip = patch.zip
  if (patch.beds != null) body.beds = patch.beds
  if (patch.baths != null) body.baths = patch.baths
  if (patch.price != null) body.price = patch.price
  if (patch.pets != null) body.pets = patch.pets
  if (patch.description != null) body.description = patch.description
  if (patch.ownerName != null) body.owner_name = patch.ownerName
  if (patch.ownerPhone != null) body.owner_phone = patch.ownerPhone
  if (patch.ownerEmail != null) body.owner_email = patch.ownerEmail
  if (patch.is_mls != null) body.is_mls = patch.is_mls
  if (patch.sqft !== undefined) body.sqft = patch.sqft
  if (patch.yearBuilt !== undefined) body.year_built = patch.yearBuilt

  const res = await supabaseFetch(`/rest/v1/listings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  await throwIfNotOk(res)
  const data = (await res.json()) as ListingRow[]
  if (!data.length) throw new Error('Update failed — 0 rows (check RLS).')
  return rowToListing(data[0])
}

/** Admin: load every listing (including unpaid / not live / expired active_until). */
export async function allListings(): Promise<Listing[]> {
  // PostgREST caps one response at 1000 rows, so page until a short page comes back.
  const PAGE = 1000
  const all: ListingRow[] = []
  for (let offset = 0; offset < 50000; offset += PAGE) {
    const res = await supabaseFetch(
      `/rest/v1/listings?select=*&order=created_at.desc,id.asc&limit=${PAGE}&offset=${offset}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    await throwIfNotOk(res)
    const data = (await res.json()) as ListingRow[]
    all.push(...data)
    if (data.length < PAGE) break
  }
  return all.map(rowToListing)
}

/**
 * Admin delete: try hard DELETE first. If RLS blocks (0 rows / error), soft-delete
 * via PATCH { live: false, paid: false } so the listing drops off Browse.
 * Returns which path succeeded.
 */
export async function deleteListing(id: string): Promise<'hard' | 'soft'> {
  const path = `/rest/v1/listings?id=eq.${encodeURIComponent(id)}`

  const delRes = await supabaseFetch(path, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
  })

  if (delRes.ok) {
    const deleted = (await delRes.json()) as unknown[]
    if (Array.isArray(deleted) && deleted.length > 0) {
      return 'hard'
    }
  }

  const patchRes = await supabaseFetch(path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ live: false, paid: false }),
  })
  await throwIfNotOk(patchRes)
  const patched = (await patchRes.json()) as unknown[]
  if (!Array.isArray(patched) || patched.length === 0) {
    throw new Error(
      'Delete failed: hard delete returned 0 rows (check RLS delete policy) and soft-delete also updated 0 rows.',
    )
  }
  return 'soft'
}

/**
 * Admin: remove every listing where is_mls=true. DIY/non-MLS rows are untouched.
 * Prefers one PostgREST DELETE with is_mls=eq.true (Prefer: return=representation).
 * Falls back to listing MLS ids and deleting in batches via deleteListing.
 */
export async function deleteAllMlsListings(): Promise<{
  mode: 'hard' | 'soft' | 'mixed'
  deleted: number
}> {
  const bulkPath = '/rest/v1/listings?is_mls=eq.true'

  const delRes = await supabaseFetch(bulkPath, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
  })

  if (delRes.ok) {
    const deleted = (await delRes.json()) as unknown[]
    if (Array.isArray(deleted) && deleted.length > 0) {
      return { mode: 'hard', deleted: deleted.length }
    }
  }

  // Bulk hard-delete returned 0 rows or failed — try bulk soft-delete
  const softRes = await supabaseFetch(bulkPath, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ live: false, paid: false }),
  })

  if (softRes.ok) {
    const patched = (await softRes.json()) as unknown[]
    if (Array.isArray(patched) && patched.length > 0) {
      return { mode: 'soft', deleted: patched.length }
    }
  }

  // Fallback: fetch MLS ids and deleteListing in batches
  const listRes = await supabaseFetch('/rest/v1/listings?is_mls=eq.true&select=id', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  await throwIfNotOk(listRes)
  const rows = (await listRes.json()) as { id: string }[]
  if (!rows.length) {
    return { mode: 'hard', deleted: 0 }
  }

  let hard = 0
  let soft = 0
  const batchSize = 25
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    for (const row of batch) {
      const mode = await deleteListing(row.id)
      if (mode === 'hard') hard += 1
      else soft += 1
    }
  }

  const deleted = hard + soft
  const mode = hard > 0 && soft > 0 ? 'mixed' : soft > 0 ? 'soft' : 'hard'
  return { mode, deleted }
}

/** Partner / resource links (mortgage, screening, etc.) */
type PartnerRow = {
  id: string
  title: string
  url: string
  category: PartnerLink['category']
  blurb: string | null
  sort_order: number
  enabled: boolean
  created_at: string
}


function rowToPartner(row: PartnerRow): PartnerLink {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    category: row.category,
    blurb: row.blurb ?? '',
    sortOrder: Number(row.sort_order ?? 0),
    enabled: row.enabled,
    createdAt: row.created_at,
  }
}

export async function enabledPartnerLinks(): Promise<PartnerLink[]> {
  const res = await supabaseFetch(
    '/rest/v1/partner_links?enabled=eq.true&order=sort_order.asc,created_at.asc',
    { method: 'GET', headers: { Accept: 'application/json' } },
  )
  await throwIfNotOk(res)
  const data = (await res.json()) as PartnerRow[]
  return data.map(rowToPartner)
}

export async function allPartnerLinks(): Promise<PartnerLink[]> {
  const res = await supabaseFetch(
    '/rest/v1/partner_links?order=sort_order.asc,created_at.asc',
    { method: 'GET', headers: { Accept: 'application/json' } },
  )
  await throwIfNotOk(res)
  const data = (await res.json()) as PartnerRow[]
  return data.map(rowToPartner)
}


/** Ensure a single http(s) scheme — fixes pasted urls after a https:// placeholder. */
function normalizePartnerUrl(raw: string): string {
  let u = raw.trim()
  u = u.replace(/^(https?:\/\/)+/gi, '')
  return `https://${u}`
}

export async function insertPartnerLink(input: {
  title: string
  url: string
  category: PartnerCategory
  blurb?: string
  sortOrder?: number
  enabled?: boolean
}): Promise<PartnerLink> {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pl_${Date.now()}`
  const body = {
    id,
    title: input.title.trim(),
    url: normalizePartnerUrl(input.url),
    category: input.category,
    blurb: (input.blurb ?? '').trim(),
    sort_order: input.sortOrder ?? 0,
    enabled: input.enabled ?? true,
  }
  const res = await supabaseFetch('/rest/v1/partner_links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  await throwIfNotOk(res)
  const data = (await res.json()) as PartnerRow[]
  return rowToPartner(data[0])
}

export async function updatePartnerLink(
  id: string,
  patch: Partial<{
    title: string
    url: string
    category: PartnerCategory
    blurb: string
    sortOrder: number
    enabled: boolean
  }>,
): Promise<PartnerLink> {
  const body: Record<string, unknown> = {}
  if (patch.title != null) body.title = patch.title.trim()
  if (patch.url != null) body.url = normalizePartnerUrl(patch.url)
  if (patch.category != null) body.category = patch.category
  if (patch.blurb != null) body.blurb = patch.blurb.trim()
  if (patch.sortOrder != null) body.sort_order = patch.sortOrder
  if (patch.enabled != null) body.enabled = patch.enabled

  const res = await supabaseFetch(`/rest/v1/partner_links?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  await throwIfNotOk(res)
  const data = (await res.json()) as PartnerRow[]
  if (!data.length) throw new Error('Update failed — 0 rows (check RLS).')
  return rowToPartner(data[0])
}

export async function deletePartnerLink(id: string): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/partner_links?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json', Prefer: 'return=representation' },
  })
  await throwIfNotOk(res)
}

/**
 * Admin: remove every DIY / owner-posted listing (is_mls false or null). MLS rows are untouched.
 * Hard DELETE first; if RLS returns 0 rows, soft-delete (live=false, paid=false).
 */
export async function deleteAllDiyListings(): Promise<{ mode: 'hard' | 'soft'; deleted: number }> {
  const bulkPath = '/rest/v1/listings?or=(is_mls.eq.false,is_mls.is.null)'
  const delRes = await supabaseFetch(bulkPath, {
    method: 'DELETE',
    headers: { Accept: 'application/json', Prefer: 'return=representation' },
  })
  if (delRes.ok) {
    const deleted = (await delRes.json()) as unknown[]
    if (Array.isArray(deleted) && deleted.length > 0) return { mode: 'hard', deleted: deleted.length }
  }
  const softRes = await supabaseFetch(bulkPath, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ live: false, paid: false }),
  })
  await throwIfNotOk(softRes)
  const patched = (await softRes.json()) as unknown[]
  return { mode: 'soft', deleted: Array.isArray(patched) ? patched.length : 0 }
}

/** Admin: delete every partner link. */
export async function deleteAllPartnerLinks(): Promise<number> {
  const res = await supabaseFetch('/rest/v1/partner_links?id=not.is.null', {
    method: 'DELETE',
    headers: { Accept: 'application/json', Prefer: 'return=representation' },
  })
  await throwIfNotOk(res)
  const rows = (await res.json()) as unknown[]
  return Array.isArray(rows) ? rows.length : 0
}


/* ======================= v38: MLS auto-expire, bulk actions, trash ======================= */

export type MlsExpirySetting = { enabled: boolean; days: number }
export const DEFAULT_MLS_EXPIRY: MlsExpirySetting = { enabled: true, days: 60 }
export const TRASH_DAYS = 7

function clampDays(n: unknown, fallback: number): number {
  const v = Math.round(Number(n))
  return Number.isFinite(v) && v >= 1 && v <= 3650 ? v : fallback
}

let expiryCache: { at: number; value: MlsExpirySetting } | null = null

/** Admin setting "MLS listings expire after N days" (stored in app_settings.mls_expiry). */
export async function getMlsExpiry(force = false): Promise<MlsExpirySetting> {
  if (!force && expiryCache && Date.now() - expiryCache.at < 20_000) return expiryCache.value
  let value = DEFAULT_MLS_EXPIRY
  try {
    const res = await supabaseFetch('/rest/v1/app_settings?key=eq.mls_expiry&select=value', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const rows = (await res.json()) as { value: Partial<MlsExpirySetting> }[]
      if (rows[0]?.value) {
        value = {
          enabled: rows[0].value.enabled !== false,
          days: clampDays(rows[0].value.days, DEFAULT_MLS_EXPIRY.days),
        }
      }
    }
  } catch {
    /* fall back to the default */
  }
  expiryCache = { at: Date.now(), value }
  return value
}

export async function saveMlsExpiry(next: MlsExpirySetting): Promise<MlsExpirySetting> {
  const value = { enabled: !!next.enabled, days: clampDays(next.days, DEFAULT_MLS_EXPIRY.days) }
  const res = await supabaseFetch('/rest/v1/app_settings?on_conflict=key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'mls_expiry', value, updated_at: new Date().toISOString() }),
  })
  await throwIfNotOk(res)
  expiryCache = { at: Date.now(), value }
  return value
}

/** Imported MLS rows with no end date get today + N days (when the setting is on). */
export async function withAutoExpiry(listings: Listing[]): Promise<Listing[]> {
  if (!listings.some((l) => l.is_mls && !l.activeUntil)) return listings
  const cfg = await getMlsExpiry()
  if (!cfg.enabled) return listings
  const until = addDaysYmd(todayYmd(), cfg.days)
  return listings.map((l) => (l.is_mls && !l.activeUntil ? { ...l, activeUntil: until } : l))
}

const ID_CHUNK = 120

function inFilter(ids: string[]): string {
  return `id=in.(${ids.map((id) => `"${id.replace(/"/g, '')}"`).map(encodeURIComponent).join(',')})`
}

async function runChunks<T>(ids: string[], fn: (chunk: string[]) => Promise<T>, onProgress?: (done: number) => void): Promise<T[]> {
  const out: T[] = []
  let done = 0
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    out.push(await fn(chunk))
    done += chunk.length
    onProgress?.(done)
  }
  return out
}

async function patchIds(ids: string[], body: Record<string, unknown>, onProgress?: (done: number) => void): Promise<number> {
  const counts = await runChunks(
    ids,
    async (chunk) => {
      const res = await supabaseFetch(`/rest/v1/listings?${inFilter(chunk)}&select=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body),
      })
      await throwIfNotOk(res)
      return ((await res.json()) as unknown[]).length
    },
    onProgress,
  )
  return counts.reduce((a, b) => a + b, 0)
}

/** Move listings to the Trash (soft delete, restorable for 7 days). */
export function trashListings(ids: string[], onProgress?: (done: number) => void) {
  return patchIds(ids, { deleted_at: new Date().toISOString() }, onProgress)
}

export function restoreListings(ids: string[], onProgress?: (done: number) => void) {
  return patchIds(ids, { deleted_at: null }, onProgress)
}

export function setListingsLive(ids: string[], live: boolean, onProgress?: (done: number) => void) {
  // activating also marks paid (same as the single-row Activate button)
  return patchIds(ids, live ? { live: true, paid: true } : { live: false }, onProgress)
}

/** Extend end dates by N days: from the current end date if it is still in the future, otherwise from today. */
export async function extendListings(
  rows: Pick<Listing, 'id' | 'activeUntil'>[],
  days: number,
  onProgress?: (done: number) => void,
): Promise<{ updated: number; dates: Record<string, string[]> }> {
  const today = todayYmd()
  const groups = new Map<string, string[]>()
  for (const r of rows) {
    const base = r.activeUntil && /^\d{4}-\d{2}-\d{2}$/.test(r.activeUntil.trim()) && r.activeUntil.trim() >= today ? r.activeUntil.trim() : today
    const next = addDaysYmd(base, days)
    if (!groups.has(next)) groups.set(next, [])
    groups.get(next)!.push(r.id)
  }
  let updated = 0
  let done = 0
  const dates: Record<string, string[]> = {}
  for (const [date, ids] of groups) {
    updated += await patchIds(ids, { active_until: date }, (d) => onProgress?.(done + d))
    done += ids.length
    dates[date] = ids
  }
  return { updated, dates }
}

/** Permanently delete specific listings (used from the Trash view and per-row delete there). */
export async function deleteListingsPermanently(ids: string[], onProgress?: (done: number) => void): Promise<number> {
  const counts = await runChunks(
    ids,
    async (chunk) => {
      const res = await supabaseFetch(`/rest/v1/listings?${inFilter(chunk)}&select=id`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', Prefer: 'return=representation' },
      })
      await throwIfNotOk(res)
      return ((await res.json()) as unknown[]).length
    },
    onProgress,
  )
  return counts.reduce((a, b) => a + b, 0)
}

/** Empty the Trash for good. */
export async function emptyTrash(): Promise<number> {
  const res = await supabaseFetch('/rest/v1/listings?deleted_at=not.is.null&select=id', {
    method: 'DELETE',
    headers: { Accept: 'application/json', Prefer: 'return=representation' },
  })
  await throwIfNotOk(res)
  return ((await res.json()) as unknown[]).length
}

/** Purge Trash rows older than 7 days (the daily pg_cron job does this too; this runs when the admin page opens). */
export async function purgeOldTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString()
  const res = await supabaseFetch(`/rest/v1/listings?deleted_at=lt.${encodeURIComponent(cutoff)}&select=id`, {
    method: 'DELETE',
    headers: { Accept: 'application/json', Prefer: 'return=representation' },
  })
  if (!res.ok) return 0
  return ((await res.json()) as unknown[]).length
}

/** One-time helper: give every live-DB MLS row with no end date an end date of today + N days. */
export async function applyExpiryToMlsWithoutEndDate(days: number): Promise<number> {
  const until = addDaysYmd(todayYmd(), days)
  const res = await supabaseFetch('/rest/v1/listings?is_mls=eq.true&active_until=is.null&deleted_at=is.null&select=id', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ active_until: until }),
  })
  await throwIfNotOk(res)
  return ((await res.json()) as unknown[]).length
}
