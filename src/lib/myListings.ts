const KEY = 'listingneeded_my_listings'

/** Listings created or paid on this device — used to show the owner their end date and a Renew button (no accounts). */
export function myListingIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function rememberMyListing(id: string) {
  try {
    const ids = myListingIds()
    if (!ids.includes(id)) localStorage.setItem(KEY, JSON.stringify([id, ...ids].slice(0, 50)))
  } catch {
    /* storage unavailable */
  }
}

export function isMyListing(id: string): boolean {
  return myListingIds().includes(id)
}
