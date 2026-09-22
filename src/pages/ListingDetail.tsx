import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { Listing } from '../lib/types'
import { getListing } from '../lib/store'

export default function ListingDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const listed = searchParams.get('listed') === '1'
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const row = await getListing(id)
        if (!cancelled) setListing(row)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load listing')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="card">
        <div className="body">Loading listing…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <div className="body" style={{ color: '#b91c1c' }}>
          {error} <Link to="/browse">Back to browse</Link>
        </div>
      </div>
    )
  }

  if (!listing || !listing.live) {
    return (
      <div className="card">
        <div className="body">
          Listing not found or not live yet. <Link to="/browse">Back to browse</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="detail">
      {listed ? (
        <div className="success" style={{ gridColumn: '1 / -1' }}>
          Payment received. Your listing is live — people will contact you directly.
        </div>
      ) : null}
      <div className="gallery">
        {(listing.photoDataUrls.length ? listing.photoDataUrls : ['']).map((src, i) =>
          src ? (
            <img key={i} src={src} alt={`Photo ${i + 1}`} />
          ) : (
            <div key={i} className="thumb empty">
              No photo
            </div>
          ),
        )}
      </div>
      <div>
        <span className={`badge ${listing.type}`}>{listing.type === 'rent' ? 'For rent' : 'For sale'}</span>
        <h1 style={{ margin: '0.4rem 0' }}>{listing.address}</h1>
        <div className="meta">
          {listing.city}, {listing.state} {listing.zip}
        </div>
        <div className="price">
          {listing.type === 'rent'
            ? `$${listing.price.toLocaleString()}/mo`
            : `$${listing.price.toLocaleString()}`}
        </div>
        <p className="meta">
          {listing.beds} beds · {listing.baths} baths · Pets: {listing.pets}
        </p>
        <p>{listing.description || 'No description provided.'}</p>
        <div className="contact-card">
          <h3 style={{ marginTop: 0 }}>Contact the owner directly</h3>
          <p className="meta">Listing Needed does not middleman this conversation.</p>
          <p>
            <strong>{listing.ownerName}</strong>
          </p>
          <p>
            <a href={`tel:${listing.ownerPhone}`}>{listing.ownerPhone}</a>
          </p>
          <p>
            <a href={`mailto:${listing.ownerEmail}?subject=Interest in ${listing.address}`}>
              {listing.ownerEmail}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
