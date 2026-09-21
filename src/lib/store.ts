import { getConfig, supabaseFetch, throwIfNotOk } from './supabase'
import type { Listing, ListingType, PartnerLink, PartnerCategory } from './types'

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
  }
}

export async function liveListings(): Promise<Listing[]> {
  const res = await supabaseFetch(
    '/rest/v1/listings?live=eq.true&paid=eq.true&order=created_at.desc',
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
  )
  await throwIfNotOk(res)
  const data = (await res.json()) as ListingRow[]
  return data.map(rowToListing)
}

export async function getListing(id: string): Promise<Listing | null> {
  const res = await supabaseFetch(`/rest/v1/listings?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  await throwIfNotOk(res)
  const data = (await res.json()) as ListingRow[]
  if (!data.length) return null
  return rowToListing(data[0])
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

export async function insertListing(listing: Listing): Promise<Listing> {
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

/** Admin: load every listing (including unpaid / not live). */
export async function allListings(): Promise<Listing[]> {
  const res = await supabaseFetch('/rest/v1/listings?select=*&order=created_at.desc', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  await throwIfNotOk(res)
  const data = (await res.json()) as ListingRow[]
  return data.map(rowToListing)
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
    url: input.url.trim(),
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
  if (patch.url != null) body.url = patch.url.trim()
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
