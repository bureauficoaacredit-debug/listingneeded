import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Listing, ListingType } from '../lib/types'
import { liveListings } from '../lib/store'

type Filter = 'all' | ListingType

function parseFilter(raw: string | null): Filter {
  if (raw === 'rent' || raw === 'sale') return raw
  return 'all'
}

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = parseFilter(searchParams.get('type'))
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const filtered = useMemo(() => {
    if (filter === 'all') return listings
    return listings.filter((l) => l.type === filter)
  }, [listings, filter])

  function setFilter(next: Filter) {
    if (next === 'all') setSearchParams({})
    else setSearchParams({ type: next })
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

      {filtered.length === 0 ? (
        <div className="card"><div className="body">
          No live {filter === 'all' ? 'listings' : filter === 'rent' ? 'rentals' : 'homes for sale'} yet.{' '}
          <Link to="/list">Be the first to list</Link>.
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
