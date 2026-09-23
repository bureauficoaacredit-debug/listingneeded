import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Listing, ListingType } from '../lib/types'
import { liveListings } from '../lib/store'

type Filter = 'all' | ListingType

function parseFilter(raw: string | null): Filter {
  if (raw === 'rent' || raw === 'sale') return raw
  return 'all'
}

function norm(s: string) {
  return s.trim().toLowerCase()
}

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = parseFilter(searchParams.get('type'))
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [zipQ, setZipQ] = useState('')
  const [cityQ, setCityQ] = useState('')
  const [streetQ, setStreetQ] = useState('')
  const [stateQ, setStateQ] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await liveListings()
        if (!cancelled) setListings(rows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load listings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const locationActive = Boolean(zipQ.trim() || cityQ.trim() || streetQ.trim() || stateQ.trim())

  const filtered = useMemo(() => {
    let rows = listings
    if (filter !== 'all') rows = rows.filter((l) => l.type === filter)

    const zip = norm(zipQ)
    const city = norm(cityQ)
    const street = norm(streetQ)
    const state = norm(stateQ)

    if (zip) rows = rows.filter((l) => norm(l.zip).includes(zip))
    if (city) rows = rows.filter((l) => norm(l.city).includes(city))
    if (street) rows = rows.filter((l) => norm(l.address).includes(street))
    if (state) rows = rows.filter((l) => norm(l.state).includes(state))

    return rows
  }, [listings, filter, zipQ, cityQ, streetQ, stateQ])

  function setFilter(next: Filter) {
    if (next === 'all') setSearchParams({})
    else setSearchParams({ type: next })
  }

  function listAll() {
    setZipQ('')
    setCityQ('')
    setStreetQ('')
    setStateQ('')
  }

  const title =
    filter === 'rent' ? 'Homes for rent' : filter === 'sale' ? 'Homes for sale' : 'Live listings'

  if (loading) {
    return <div className="card"><div className="body">Loading listings…</div></div>
  }

  if (error) {
    return <div className="card"><div className="body" style={{color:'#b91c1c'}}>{error}</div></div>
  }

  return (
    <div style={{display:'grid', gap:'1rem'}}>
      <div>
        <h1 style={{margin:'0 0 .35rem'}}>{title}</h1>
        <p className="meta">Only paid, live homes. Contact owners directly.</p>
      </div>

      <div className="filter-tabs" role="tablist" aria-label="Listing type">
        <button
          type="button"
          role="tab"
          className={`filter-tab${filter === 'all' ? ' active' : ''}`}
          aria-selected={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          className={`filter-tab${filter === 'rent' ? ' active' : ''}`}
          aria-selected={filter === 'rent'}
          onClick={() => setFilter('rent')}
        >
          For rent
        </button>
        <button
          type="button"
          role="tab"
          className={`filter-tab${filter === 'sale' ? ' active' : ''}`}
          aria-selected={filter === 'sale'}
          onClick={() => setFilter('sale')}
        >
          For sale
        </button>
      </div>

      <div className="search-filters" aria-label="Location filters">
        <div className="search-filters-row">
          <label>
            ZIP
            <input
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="e.g. 06824"
              value={zipQ}
              onChange={(e) => setZipQ(e.target.value)}
            />
          </label>
          <label>
            City
            <input
              type="text"
              autoComplete="address-level2"
              placeholder="e.g. Fairfield"
              value={cityQ}
              onChange={(e) => setCityQ(e.target.value)}
            />
          </label>
          <label>
            Street
            <input
              type="text"
              autoComplete="street-address"
              placeholder="Partial address"
              value={streetQ}
              onChange={(e) => setStreetQ(e.target.value)}
            />
          </label>
          <label>
            State
            <input
              type="text"
              autoComplete="address-level1"
              placeholder="CT, NY, MA…"
              maxLength={2}
              value={stateQ}
              onChange={(e) => setStateQ(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2))}
              aria-label="State (2-letter abbreviation)"
            />
          </label>
        </div>
        <div className="search-filters-actions">
          <button type="button" className="btn secondary" onClick={listAll} disabled={!locationActive}>
            List all
          </button>
          {locationActive && (
            <p className="search-filters-meta">
              Showing {filtered.length} of {listings.filter((l) => filter === 'all' || l.type === filter).length} listings
            </p>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="body">
          {locationActive ? (
            <>
              No homes match those filters.{' '}
              <button type="button" className="btn ghost" style={{padding:'0.35rem 0.75rem', fontSize:'0.8rem', verticalAlign:'middle'}} onClick={listAll}>
                List all
              </button>
            </>
          ) : (
            <>
              No live {filter === 'all' ? 'listings' : filter === 'rent' ? 'rentals' : 'homes for sale'} yet.{' '}
              <Link to="/list">Be the first to list</Link>.
            </>
          )}
        </div></div>
      ) : (
        <div className="grid">
          {filtered.map((l) => (
            <Link key={l.id} to={`/listing/${l.id}`} className="card" style={{color:'inherit'}}>
              {l.photoDataUrls[0] ? (
                <img className="thumb" src={l.photoDataUrls[0]} alt="" />
              ) : (
                <div className="thumb empty">No photo</div>
              )}
              <div className="body">
                <span className={`badge ${l.type}`}>{l.type === 'rent' ? 'For rent' : 'For sale'}</span>
                {l.is_mls ? <span className="badge mls">MLS listing</span> : null}
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
