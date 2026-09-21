import { getConfig, supabaseFetch, throwIfNotOk } from './supabase'
import type { Listing, ListingType } from './types'

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
