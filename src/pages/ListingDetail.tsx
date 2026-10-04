import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import ShareButton from '../components/ShareButton'
import type { Listing } from '../lib/types'
import { getListing, getPaidTerm } from '../lib/store'
import { isMyListing } from '../lib/myListings'
import { paymentLinkForListing } from '../lib/checkout'
import { isActiveUntilOk } from '../lib/types'

function fmtEnd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) return ymd
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function ListingDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const listed = searchParams.get('listed') === '1'
  const renewed = searchParams.get('renewed') === '1'
  const [termDays, setTermDays] = useState(90)
  const [renewError, setRenewError] = useState('')
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void getPaidTerm().then((t) => setTermDays(t.days))
  }, [])

  function renew() {
    if (!listing) return
    setRenewError('')
    try {
      const url = paymentLinkForListing({ listingId: listing.id, type: listing.type, email: listing.ownerEmail })
      localStorage.setItem('listingneeded_pending_listing_id', listing.id)
      localStorage.setItem('listingneeded_pending_renew', '1')
      window.location.href = url
    } catch (e) {
      setRenewError(e instanceof Error ? e.message : 'Could not start the renewal payment')
    }
  }

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
      {listed || renewed ? (
        <div className="success" style={{ gridColumn: '1 / -1' }}>
          {renewed ? 'Renewal received.' : 'Payment received.'} Your listing is live — people will contact you directly.
          {listing.activeUntil ? <> It stays live through <strong>{fmtEnd(listing.activeUntil)}</strong>.</> : null}
        </div>
      ) : null}
      {!listing.is_mls && isMyListing(listing.id) ? (
        <div className="owner-term" style={{ gridColumn: '1 / -1' }}>
          <div>
            <strong>Your listing</strong>
            {listing.activeUntil ? (
              <>
                {' '}
                {isActiveUntilOk(listing.activeUntil) ? 'is live through' : 'ended on'} <strong>{fmtEnd(listing.activeUntil)}</strong>
                {isActiveUntilOk(listing.activeUntil) ? ` (${termDays}-day term from payment).` : '.'}
              </>
            ) : (
              ' has no end date.'
            )}
            <div className="meta">
              Questions? Marcel Najar · <a href="https://www.listingneeded.com">www.listingneeded.com</a> · <a href="tel:2038183242">203-818-3242</a>
            </div>
          </div>
          <div>
            <button type="button" className="btn" onClick={renew}>
              Renew / extend +{termDays} days
            </button>
            {renewError ? <div className="meta" style={{ color: '#b91c1c' }}>{renewError}</div> : null}
          </div>
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
        <div className="detail-top">
          <div>
            <span className={`badge ${listing.type}`}>{listing.type === 'rent' ? 'For rent' : 'For sale'}</span>
            {listing.is_mls ? <span className="badge mls">MLS listing</span> : null}
          </div>
          <ShareButton listing={listing} />
        </div>
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
          {listing.beds} beds · {listing.baths} baths
          {listing.sqft ? ` · ${listing.sqft.toLocaleString()} sq ft` : ''}
          {listing.yearBuilt ? ` · built ${listing.yearBuilt}` : ''} · Pets: {listing.pets}
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
