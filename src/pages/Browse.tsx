import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { liveListings } from '../lib/store'

export default function Browse() {
  const listings = useMemo(() => liveListings(), [])
  return (
    <div style={{display:'grid', gap:'1rem'}}>
      <div>
        <h1 style={{margin:'0 0 .35rem'}}>Live listings</h1>
        <p className="meta">Only paid, live homes. Contact owners directly.</p>
      </div>
      {listings.length === 0 ? (
        <div className="card"><div className="body">No live listings yet. <Link to="/list">Be the first to list</Link>.</div></div>
      ) : (
        <div className="grid">
          {listings.map((l) => (
            <Link key={l.id} to={`/listing/${l.id}`} className="card" style={{color:'inherit'}}>
              {l.photoDataUrls[0] ? (
                <img className="thumb" src={l.photoDataUrls[0]} alt="" />
              ) : (
                <div className="thumb empty">No photo</div>
              )}
              <div className="body">
                <span className={`badge ${l.type}`}>{l.type === 'rent' ? 'For rent' : 'For sale'}</span>
                <div className="price">{l.type === 'rent' ? `$${l.price.toLocaleString()}/mo` : `$${l.price.toLocaleString()}`}</div>
                <h3>{l.address}</h3>
                <div className="meta">{l.city}, {l.state} {l.zip} · {l.beds} bd · {l.baths} ba</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
