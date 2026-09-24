import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Listing, ListingType } from '../lib/types'
import { liveListings } from '../lib/store'

type Filter = 'all' | ListingType

function parseFilter(raw: string | null): Filter {
  if (raw === 'rent' || raw === 'sale') return raw
  return 'all'
}

function norm(s: string | null | undefined) {
  return (s ?? '').trim().toLowerCase()
}

/** Match keyword against address / city / zip / state (empty zip still searchable via city/street/state). */
function matchesKeyword(l: Listing, q: string) {
  if (!q) return true
  const hay = `${norm(l.address)} ${norm(l.city)} ${norm(l.zip)} ${norm(l.state)}`
  return hay.includes(q)
}

function hasLocationParams(params: URLSearchParams) {
  return Boolean(
    params.get('q')?.trim() ||
      params.get('zip')?.trim() ||
      params.get('city')?.trim() ||
      params.get('street')?.trim() ||
      params.get('state')?.trim() ||
      params.get('min')?.trim() ||
      params.get('max')?.trim(),
  )
}

/** Parse "2500" / "2,500" / "$2,500" → number, or null if blank/invalid. */
function parsePriceInput(raw: string): number | null {
  const cleaned = String(raw || '').replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** If both set and min > max, swap quietly. */
function normalizePriceRange(
  minRaw: string,
  maxRaw: string,
): { min: number | null; max: number | null } {
  let min = parsePriceInput(minRaw)
  let max = parsePriceInput(maxRaw)
  if (min != null && max != null && min > max) {
    const tmp = min
    min = max
    max = tmp
  }
  return { min, max }
}

function filterSummary(parts: {
  keyword: string
  zip: string
  city: string
  street: string
  state: string
  minPrice: number | null
  maxPrice: number | null
}) {
  const bits: string[] = []
  if (parts.street.trim()) bits.push(parts.street.trim())
  if (parts.city.trim()) bits.push(parts.city.trim())
  if (parts.state.trim()) bits.push(parts.state.trim().toUpperCase())
  if (parts.zip.trim()) bits.push(parts.zip.trim())
  if (parts.keyword.trim() && bits.length === 0) bits.push(parts.keyword.trim())
  else if (
    parts.keyword.trim() &&
    !bits.some((b) => b.toLowerCase() === parts.keyword.trim().toLowerCase())
  ) {
    bits.unshift(parts.keyword.trim())
  }
  if (parts.minPrice != null || parts.maxPrice != null) {
    const lo = parts.minPrice != null ? `$${parts.minPrice.toLocaleString()}` : ''
    const hi = parts.maxPrice != null ? `$${parts.maxPrice.toLocaleString()}` : ''
    if (lo && hi) bits.push(`${lo}–${hi}`)
    else if (lo) bits.push(`from ${lo}`)
    else if (hi) bits.push(`up to ${hi}`)
  }
  return bits.length ? bits.join(' · ') : 'All listings'
}

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = parseFilter(searchParams.get('type'))
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const resultsRef = useRef<HTMLDivElement>(null)

  const initialQ = searchParams.get('q') ?? ''
  const initialZip = searchParams.get('zip') ?? ''
  const initialCity = searchParams.get('city') ?? ''
  const initialStreet = searchParams.get('street') ?? ''
  const initialState = searchParams.get('state') ?? ''
  const initialMin = searchParams.get('min') ?? ''
  const initialMax = searchParams.get('max') ?? ''
  const initialPrice = normalizePriceRange(initialMin, initialMax)
  const hadUrlFilters = hasLocationParams(searchParams)

  // Draft fields (what the user types)
  const [keywordDraft, setKeywordDraft] = useState(initialQ)
  const [zipDraft, setZipDraft] = useState(initialZip)
  const [cityDraft, setCityDraft] = useState(initialCity)
  const [streetDraft, setStreetDraft] = useState(initialStreet)
  const [stateDraft, setStateDraft] = useState(initialState)
  const [minDraft, setMinDraft] = useState(initialMin)
  const [maxDraft, setMaxDraft] = useState(initialMax)

  // Applied filters (updated by Search / List all)
  const [keywordQ, setKeywordQ] = useState(initialQ)
  const [zipQ, setZipQ] = useState(initialZip)
  const [cityQ, setCityQ] = useState(initialCity)
  const [streetQ, setStreetQ] = useState(initialStreet)
  const [stateQ, setStateQ] = useState(initialState)
  const [minPrice, setMinPrice] = useState<number | null>(initialPrice.min)
  const [maxPrice, setMaxPrice] = useState<number | null>(initialPrice.max)

  // Expanded on first load when no filters; collapsed if filters came from URL
  const [searchExpanded, setSearchExpanded] = useState(!hadUrlFilters)

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

  const locationActive = Boolean(
    keywordQ.trim() ||
      zipQ.trim() ||
      cityQ.trim() ||
      streetQ.trim() ||
      stateQ.trim() ||
      minPrice != null ||
      maxPrice != null,
  )

  const typeCount = useMemo(
    () => listings.filter((l) => filter === 'all' || l.type === filter).length,
    [listings, filter],
  )

  const filtered = useMemo(() => {
    let rows = listings
    if (filter !== 'all') rows = rows.filter((l) => l.type === filter)

    const keyword = norm(keywordQ)
    const zip = norm(zipQ)
    const city = norm(cityQ)
    const street = norm(streetQ)
    const state = norm(stateQ)

    if (keyword) rows = rows.filter((l) => matchesKeyword(l, keyword))
    // ZIP: only rows that have a zip containing the query (empty-zip MLS rows won't match ZIP — use city/street/keyword)
    if (zip) rows = rows.filter((l) => norm(l.zip).includes(zip))
    if (city) rows = rows.filter((l) => norm(l.city).includes(city))
    if (street) rows = rows.filter((l) => norm(l.address).includes(street))
    if (state) rows = rows.filter((l) => norm(l.state).includes(state))
    if (minPrice != null) rows = rows.filter((l) => l.price >= minPrice)
    if (maxPrice != null) rows = rows.filter((l) => l.price <= maxPrice)

    return rows
  }, [listings, filter, keywordQ, zipQ, cityQ, streetQ, stateQ, minPrice, maxPrice])

  function writeParams(next: {
    type?: Filter
    keyword?: string
    zip?: string
    city?: string
    street?: string
    state?: string
    min?: number | null
    max?: number | null
  }) {
    const params = new URLSearchParams()
    const type = next.type ?? filter
    if (type !== 'all') params.set('type', type)
    const kw = (next.keyword ?? keywordQ).trim()
    const zip = (next.zip ?? zipQ).trim()
    const city = (next.city ?? cityQ).trim()
    const street = (next.street ?? streetQ).trim()
    const state = (next.state ?? stateQ).trim()
    const min = next.min !== undefined ? next.min : minPrice
    const max = next.max !== undefined ? next.max : maxPrice
    if (kw) params.set('q', kw)
    if (zip) params.set('zip', zip)
    if (city) params.set('city', city)
    if (street) params.set('street', street)
    if (state) params.set('state', state)
    if (min != null) params.set('min', String(min))
    if (max != null) params.set('max', String(max))
    setSearchParams(params, { replace: true })
  }

  function setFilter(next: Filter) {
    writeParams({ type: next })
  }

  function scrollToResults() {
    // Defer so collapse layout settles before scrolling
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function applySearch(e?: FormEvent) {
    e?.preventDefault()
    const range = normalizePriceRange(minDraft, maxDraft)
    // Reflect a quiet swap in the draft boxes so Min/Max stay consistent with the filter.
    setMinDraft(range.min != null ? String(range.min) : minDraft.trim() ? minDraft : '')
    setMaxDraft(range.max != null ? String(range.max) : maxDraft.trim() ? maxDraft : '')
    setKeywordQ(keywordDraft)
    setZipQ(zipDraft)
    setCityQ(cityDraft)
    setStreetQ(streetDraft)
    setStateQ(stateDraft)
    setMinPrice(range.min)
    setMaxPrice(range.max)
    writeParams({
      keyword: keywordDraft,
      zip: zipDraft,
      city: cityDraft,
      street: streetDraft,
      state: stateDraft,
      min: range.min,
      max: range.max,
    })
    setSearchExpanded(false)
    scrollToResults()
  }

  function listAll() {
    setKeywordDraft('')
    setZipDraft('')
    setCityDraft('')
    setStreetDraft('')
    setStateDraft('')
    setMinDraft('')
    setMaxDraft('')
    setKeywordQ('')
    setZipQ('')
    setCityQ('')
    setStreetQ('')
    setStateQ('')
    setMinPrice(null)
    setMaxPrice(null)
    writeParams({
      keyword: '',
      zip: '',
      city: '',
      street: '',
      state: '',
      min: null,
      max: null,
    })
    setSearchExpanded(false)
    scrollToResults()
  }

  const summary = filterSummary({
    keyword: keywordQ,
    zip: zipQ,
    city: cityQ,
    street: streetQ,
    state: stateQ,
    minPrice,
    maxPrice,
  })

  const draftDirty = Boolean(
    keywordDraft.trim() ||
      zipDraft.trim() ||
      cityDraft.trim() ||
      streetDraft.trim() ||
      stateDraft.trim() ||
      minDraft.trim() ||
      maxDraft.trim(),
  )

  const title =
    filter === 'rent' ? 'Homes for rent' : filter === 'sale' ? 'Homes for sale' : 'Search homes'

  if (loading) {
    return (
      <div className="card">
        <div className="body">Loading listings…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <div className="body" style={{ color: '#b91c1c' }}>
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="browse-page">
      <div className="browse-heading">
        <h1>{title}</h1>
        <p className="meta">
          Filter by ZIP, city, street, state, or price — or type a keyword. MLS rows with a blank ZIP still
          match city / street / state.
        </p>
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

      {searchExpanded ? (
        <form
          className="search-filters search-filters--sticky search-filters--expanded"
          aria-label="Search listings"
          onSubmit={applySearch}
        >
          <input
            className="search-keyword-input"
            type="search"
            name="q"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="City, street, ZIP, or state…"
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            aria-label="Search by address, city, ZIP, or state"
          />

          <div className="search-filters-row">
            <label>
              ZIP
              <input
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="e.g. 06824"
                value={zipDraft}
                onChange={(e) => setZipDraft(e.target.value)}
              />
            </label>
            <label>
              City
              <input
                type="text"
                autoComplete="address-level2"
                placeholder="e.g. Fairfield"
                value={cityDraft}
                onChange={(e) => setCityDraft(e.target.value)}
              />
            </label>
            <label>
              Street
              <input
                type="text"
                autoComplete="street-address"
                placeholder="Partial address"
                value={streetDraft}
                onChange={(e) => setStreetDraft(e.target.value)}
              />
            </label>
            <label>
              State
              <input
                type="text"
                autoComplete="address-level1"
                placeholder="CT"
                maxLength={2}
                value={stateDraft}
                onChange={(e) => setStateDraft(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2))}
                aria-label="State (2-letter abbreviation)"
              />
            </label>
            <label>
              Min $
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 2,500"
                value={minDraft}
                onChange={(e) => setMinDraft(e.target.value)}
                aria-label="Minimum price"
              />
            </label>
            <label>
              Max $
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 5,000"
                value={maxDraft}
                onChange={(e) => setMaxDraft(e.target.value)}
                aria-label="Maximum price"
              />
            </label>
          </div>

          <div className="search-filters-actions">
            <button type="submit" className="btn search-filters-submit">
              Search
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={listAll}
              disabled={!locationActive && !draftDirty}
            >
              List all
            </button>
            <p className="search-filters-meta" aria-live="polite">
              {locationActive
                ? `Showing ${filtered.length} of ${typeCount} listings`
                : `${typeCount} live listing${typeCount === 1 ? '' : 's'}`}
            </p>
          </div>
        </form>
      ) : (
        <form
          className="search-filters search-filters--sticky search-filters--collapsed"
          aria-label="Search listings"
          onSubmit={applySearch}
        >
          <input
            type="search"
            name="q"
            className="search-collapsed-input"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Search city, street, ZIP, or state"
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            aria-label="Search by address, city, ZIP, or state"
          />
          <label className="search-collapsed-price">
            <span>Min $</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Min"
              value={minDraft}
              onChange={(e) => setMinDraft(e.target.value)}
              aria-label="Minimum price"
            />
          </label>
          <label className="search-collapsed-price">
            <span>Max $</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Max"
              value={maxDraft}
              onChange={(e) => setMaxDraft(e.target.value)}
              aria-label="Maximum price"
            />
          </label>
          <button type="submit" className="btn search-collapsed-go">
            Search
          </button>
          <span className="search-collapsed-count" aria-live="polite">
            {locationActive
              ? `${summary} · ${filtered.length} of ${typeCount}`
              : `${typeCount} listing${typeCount === 1 ? '' : 's'}`}
          </span>
          <div className="search-collapsed-actions">
            <button
              type="button"
              className="btn ghost search-collapsed-edit"
              onClick={() => setSearchExpanded(true)}
            >
              More filters
            </button>
            {locationActive ? (
              <button
                type="button"
                className="btn secondary search-collapsed-clear"
                onClick={listAll}
                title="Clear filters and list all"
              >
                List all
              </button>
            ) : null}
          </div>
        </form>
      )}

      <div ref={resultsRef} className="browse-results">
        {filtered.length === 0 ? (
          <div className="card">
            <div className="body">
              {locationActive ? (
                <>
                  No homes match those filters.{' '}
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', verticalAlign: 'middle' }}
                    onClick={listAll}
                  >
                    List all
                  </button>
                </>
              ) : (
                <>
                  No live {filter === 'all' ? 'listings' : filter === 'rent' ? 'rentals' : 'homes for sale'} yet.{' '}
                  <Link to="/list">Be the first to list</Link>.
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="grid">
            {filtered.map((l) => (
              <Link key={l.id} to={`/listing/${l.id}`} className="card" style={{ color: 'inherit' }}>
                {l.photoDataUrls[0] ? (
                  <img className="thumb" src={l.photoDataUrls[0]} alt="" />
                ) : (
                  <div className="thumb empty">No photo</div>
                )}
                <div className="body">
                  <span className={`badge ${l.type}`}>{l.type === 'rent' ? 'For rent' : 'For sale'}</span>
                  {l.is_mls ? <span className="badge mls">MLS listing</span> : null}
                  <div className="price">
                    {l.type === 'rent' ? `$${l.price.toLocaleString()}/mo` : `$${l.price.toLocaleString()}`}
                  </div>
                  <h3>{l.address}</h3>
                  <div className="meta">
                    {l.city}, {l.state} {l.zip || ''} · {l.beds} bd · {l.baths} ba
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
