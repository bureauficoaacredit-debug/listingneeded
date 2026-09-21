export type ListingType = 'rent' | 'sale'

export type Listing = {
  id: string
  type: ListingType
  address: string
  city: string
  state: string
  zip: string
  beds: number
  baths: number
  price: number
  pets: 'no' | 'yes' | 'negotiable'
  description: string
  photoDataUrls: string[]
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  createdAt: string
  paid: boolean
  live: boolean
}

export const LISTING_FEE_RENT_USD = 99
export const LISTING_FEE_SALE_USD = 800

export function listingFeeUsd(type: ListingType) {
  return type === 'sale' ? LISTING_FEE_SALE_USD : LISTING_FEE_RENT_USD
}
