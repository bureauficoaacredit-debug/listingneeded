import { Link } from 'react-router-dom'
import { mlsStatusBadge, type Listing } from '../lib/types'

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
        <span className={`badge ${l.type}`}>{l.type === 'rent' ? 'For rent' : 'For sale'}</span>
        {l.is_mls ? <span className="badge mls">MLS listing</span> : null}
        {mlsStatusBadge(l.mlsStatus) ? <span className="badge status" title={l.mlsStatus ?? ''}>{mlsStatusBadge(l.mlsStatus)}</span> : null}
        <div className="price">{l.type === 'rent' ? `$${l.price.toLocaleString()}/mo` : `$${l.price.toLocaleString()}`}</div>
        <h3>{l.address}</h3>
        <div className="meta">
          {l.city}, {l.state} {l.zip || ''} · {l.beds} bd · {l.baths} ba
        </div>
      </div>
    </Link>
  )
}
