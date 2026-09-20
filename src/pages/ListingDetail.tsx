import { Link, useParams } from 'react-router-dom'
import { getListing } from '../lib/store'

export default function ListingDetail() {
  const { id } = useParams()
  const listing = id ? getListing(id) : undefined
  if (!listing || !listing.live) {
    return <div className="card"><div className="body">Listing not found or not live. <Link to="/browse">Back to browse</Link></div></div>
  }
  return (
    <div className="detail">
      <div className="gallery">
        {(listing.photoDataUrls.length ? listing.photoDataUrls : ['']).map((src, i) =>
          src ? <img key={i} src={src} alt={`Photo ${i+1}`} /> : <div key={i} className="thumb empty">No photo</div>
        )}
      </div>
      <div>
        <span className={`badge ${listing.type}`}>{listing.type === 'rent' ? 'For rent' : 'For sale'}</span>
        <h1 style={{margin:'0.4rem 0'}}>{listing.address}</h1>
        <div className="meta">{listing.city}, {listing.state} {listing.zip}</div>
        <div className="price">{listing.type === 'rent' ? `$${listing.price.toLocaleString()}/mo` : `$${listing.price.toLocaleString()}`}</div>
        <p className="meta">{listing.beds} beds · {listing.baths} baths · Pets: {listing.pets}</p>
        <p>{listing.description || 'No description provided.'}</p>
        <div className="contact-card">
          <h3 style={{marginTop:0}}>Contact the owner directly</h3>
          <p className="meta">Listing Needed does not middleman this conversation.</p>
          <p><strong>{listing.ownerName}</strong></p>
          <p><a href={`tel:${listing.ownerPhone}`}>{listing.ownerPhone}</a></p>
          <p><a href={`mailto:${listing.ownerEmail}?subject=Interest in ${listing.address}`}>{listing.ownerEmail}</a></p>
        </div>
      </div>
    </div>
  )
}
