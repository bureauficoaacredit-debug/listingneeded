/** v71: outbound links (Airbnb / RentCafe) that keep the visitor on Listing Needed. Links only: no outside data is loaded. */
export type OutboundTo = 'airbnb' | 'rentcafe'
export type OutboundLink = { to: OutboundTo; label: string; href: string; town: string; state: string; zip: string }

export const airbnbUrl = (town: string, state = 'CT') =>
  `https://www.airbnb.com/s/${encodeURIComponent(`${town.trim().replace(/\s+/g, '-')}--${state}`)}/homes`
export const rentCafeUrl = (zip: string, town: string) =>
  zip ? `https://www.rentcafe.com/apartments-for-rent/${zip}-ct/` : town.toLowerCase() === 'fairfield' ? 'https://www.rentcafe.com/apartments-for-rent/06825-ct/' : `https://www.rentcafe.com/apartments-for-rent/${town.trim().toLowerCase().replace(/\s+/g, '-')}-ct/`

export function exploreHref(l: Pick<OutboundLink, 'to' | 'town' | 'state' | 'zip'>, back: string) {
  const p = new URLSearchParams()
  if (l.town) p.set('town', l.town)
  if (l.state) p.set('state', l.state)
  if (l.zip) p.set('zip', l.zip)
  p.set('to', l.to)
  if (back) p.set('back', back)
  return `/explore?${p.toString()}`
}

/** Open the outside site in a new tab synchronously inside the click (so pop-up blockers allow it). */
export function openOutside(href: string) {
  const w = window.open(href, '_blank', 'noopener,noreferrer')
  return w
}
