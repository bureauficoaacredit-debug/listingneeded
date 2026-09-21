import { supabase } from './supabase'
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
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('live', true)
    .eq('paid', true)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as ListingRow[] | null)?.map(rowToListing) ?? []
}

export async function getListing(id: string): Promise<Listing | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return rowToListing(data as ListingRow)
}

/** Upload image files to the public listing-photos bucket; returns public URLs. */
export async function uploadListingPhotos(listingId: string, files: File[]): Promise<string[]> {
  const urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${listingId}/${i}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('listing-photos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/jpeg',
    })
    if (error) {
      console.warn('Photo upload failed, skipping:', error.message)
      continue
    }
    const { data } = supabase.storage.from('listing-photos').getPublicUrl(path)
    if (data?.publicUrl) urls.push(data.publicUrl)
  }
  return urls
}

export async function insertListing(listing: Listing): Promise<Listing> {
  const row = listingToRow(listing)
  const { data, error } = await supabase.from('listings').insert(row).select('*').single()
  if (error) throw error
  return rowToListing(data as ListingRow)
}

export async function markPaidAndLive(id: string): Promise<Listing | null> {
  const { data, error } = await supabase
    .from('listings')
    .update({ paid: true, live: true })
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return rowToListing(data as ListingRow)
}

export async function updateListingPhotos(id: string, photoUrls: string[]): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .update({ photo_urls: photoUrls })
    .eq('id', id)
  if (error) throw error
}
