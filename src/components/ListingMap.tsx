import type { Listing } from '../lib/types'

/** Address for map lookups: drop unit/apt parts (e.g. "Unit# 99") so the pin lands on the building. */
export function mapQuery(l: Pick<Listing, 'address' | 'city' | 'state' | 'zip'>): string {
  const street = l.address
    .replace(/,?\s*(?:unit|apt|apartment|suite|ste|fl|floor)\.?\s*#?\s*[\w-]+\s*$/i, '')
    .replace(/,?\s*#\s*[\w-]+\s*$/, '')
    .replace(/\s+,/g, ',')
    .trim()
  return [street, l.city, [l.state, l.zip].filter(Boolean).join(' ')].filter((s) => s && s.trim()).join(', ')
}

function isApple() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** v44: no-key Google Maps embed (lazy) + "Open in Maps" (Apple Maps on iPhone/iPad, Google Maps elsewhere). */
export default function ListingMap({ listing }: { listing: Listing }) {
  const q = mapQuery(listing)
  if (!q) return null
  const enc = encodeURIComponent(q)
  const openHref = isApple() ? `https://maps.apple.com/?q=${enc}` : `https://www.google.com/maps/search/?api=1&query=${enc}`
  return (
    <section className="listing-map" aria-label="Map">
      <div className="listing-map-head">
        <h3>Location</h3>
        <a className="listing-map-open" href={openHref} target="_blank" rel="noopener noreferrer">
          Open in Maps ↗
        </a>
      </div>
      <div className="listing-map-frame">
        <iframe
          title={`Map of ${q}`}
          src={`https://maps.google.com/maps?q=${enc}&z=15&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
      <p className="meta listing-map-addr">{q}</p>
    </section>
  )
}
