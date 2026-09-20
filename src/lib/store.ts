import type { Listing } from './types'

const KEY = 'listingneeded_listings_v1'

export function loadListings(): Listing[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as Listing[]
  } catch {
    return []
  }
}

export function saveListings(listings: Listing[]) {
  localStorage.setItem(KEY, JSON.stringify(listings))
}

export function upsertListing(listing: Listing) {
  const all = loadListings()
  const i = all.findIndex((l) => l.id === listing.id)
  if (i >= 0) all[i] = listing
  else all.unshift(listing)
  saveListings(all)
  return listing
}

export function getListing(id: string) {
  return loadListings().find((l) => l.id === id)
}

export function liveListings() {
  return loadListings().filter((l) => l.live && l.paid)
}

export function markPaidAndLive(id: string) {
  const all = loadListings()
  const i = all.findIndex((l) => l.id === id)
  if (i < 0) return null
  all[i] = { ...all[i], paid: true, live: true }
  saveListings(all)
  return all[i]
}
