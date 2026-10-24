import { Link } from 'react-router-dom'
import { mlsStatusBadge, priceText, typeLabel, type Listing } from '../lib/types'

/** Search result card (shared component). */
export default function ListingCard({ l }: { l: Listing }) {
  return (
    <Link to={`/listing/${l.id}`} className="card" style={{ color: 'inherit' }}>
      {l.photoDataUrls[0] ? (
        <img className="thumb" src={l.photoDataUrls[0]} alt="" loading="lazy" decoding="async" />
      ) : (
        <div className="thumb empty">No photo</div>
      )}
      <div className="body">
        <span className={`badge ${l.type}`}>{typeLabel(l.type)}</span>
        {l.is_mls ? <span className="badge mls">MLS listing</span> : null}
        {l.source === 'hud' ? <span className="badge hud" title="Home owned by HUD (U.S. Dept. of Housing and Urban Development)">HUD home</span> : null}
        {l.shortSale ? <span className="badge short-sale" title="Sale needs the lender's approval">Short sale</span> : null}
        {mlsStatusBadge(l.mlsStatus) ? <span className="badge status" title={l.mlsStatus ?? ''}>{mlsStatusBadge(l.mlsStatus)}</span> : null}
        <div className="price">{priceText(l)}</div>
        <h3>{l.address}</h3>
        <div className="meta">
          {l.city}, {l.state} {l.zip || ''} · {l.beds} bd · {l.baths} ba{l.type === 'short-term' && l.maxGuests ? ` · ${l.maxGuests} guests` : ''}
        </div>
      </div>
    </Link>
  )
}
