import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { mlsStatusBadge, type Listing, type ListingType } from '../lib/types'
import { cachedLiveListings, loadLiveListings } from '../lib/store'

type Filter = 'all' | ListingType

/** v42: phone widths only (matches the existing 720px mobile CSS breakpoint). Desktop markup is untouched. */
const MOBILE_MQ = '(max-width: 720px)'
function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia(MOBILE_MQ)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
function useIsMobile() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_MQ).matches,
    () => false,
  )
}

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
  if (hay.includes(q)) return true
  if (matchesMlsNumber(l, q)) return true
  // v66: "Fairfield, CT", "fairfield ct", "Fairfield CT 06824", "Fairfeild": match word by word (commas and the state
  // name are ignored; every remaining word must appear; a town name may have one small typo)
  const words = searchWords(q)
  const core = words.filter((w) => !STATE_WORDS.has(w))
  if (!core.length) return words.length > 0 && isCt(l.state)
  const flat = ` ${searchWords(hay).join(' ')} `
  return core.every((w) => flat.includes(w) || townTypo(l.city, w))
}

// v66: word-by-word search helpers
const STATE_WORDS = new Set(['ct', 'conn', 'connecticut', 'usa', 'us'])
function searchWords(s: string) {
  return s.toLowerCase().replace(/[.,;:#/()]+/g, ' ').split(/\s+/).filter(Boolean)
}
function isCt(state: string | null | undefined) {
  return ['ct', 'conn', 'connecticut'].includes(norm(state))
}
/** City box: "Fairfield, CT" -> "fairfield" (state words dropped), then contains-match or a one-typo town match. */
function matchesCity(city: string | null | undefined, q: string) {
  const want = searchWords(q).filter((w) => !STATE_WORDS.has(w)).join(' ')
  if (!want) return true
  const have = searchWords(city ?? '').join(' ')
  return have.includes(want) || (!want.includes(' ') && townTypo(city, want))
}
const typoCache = new Map<string, boolean>()
/** True when the word is a town-name word with a small typo (1 edit/transposition; 2 for 9+ letters). */
function townTypo(city: string | null | undefined, w: string) {
  if (w.length < 5 || /\d/.test(w)) return false
  const key = `${norm(city)}|${w}`
  let hit = typoCache.get(key)
  if (hit === undefined) {
    const max = w.length >= 9 ? 2 : 1
    hit = searchWords(city ?? '').some((cw) => Math.abs(cw.length - w.length) <= max && editDistance(cw, w) <= max)
    if (typoCache.size > 5000) typoCache.clear()
    typoCache.set(key, hit)
  }
  return hit
}
/** Optimal-string-alignment distance (insert, delete, substitute, swap neighbours). */
function editDistance(a: string, b: string) {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

/**
 * v41: the same text box also finds a home by MLS number (silent — no label/placeholder). The number is the id suffix
 * (mls_24206019). Accepts "24206019", "mls_24206019", "MLS #24206019", "#24206019", or partial digits.
 * A bare query needs 6+ digits (so 5-digit ZIP searches behave exactly as before); with an explicit mls/# prefix 5+ digits.
 */
function matchesMlsNumber(l: Listing, q: string) {
  const m = /^(mls[\s_#:.-]*|#\s*)?(\d[\d\s-]*)$/i.exec(q.trim())
  if (!m) return false
  const digits = m[2].replace(/\D/g, '')
  if (digits.length < (m[1] ? 5 : 6)) return false
  const num = /^mls_(\d+)$/.exec(l.id)?.[1] ?? (l.is_mls ? /\bMLS\s*#\s*(\d+)/i.exec(l.description)?.[1] : undefined)
  return !!num && num.includes(digits)
}

const BROWSE_PAGE = 48

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

// v65: outbound links to RentCafe's rental search + a call line (links only: no RentCafe data is loaded or copied)
const RENTCAFE_DEFAULTS = [
  { label: 'More Fairfield rentals on RentCafe', href: 'https://www.rentcafe.com/apartments-for-rent/06825-ct/' },
  { label: 'More Stamford rentals on RentCafe', href: 'https://www.rentcafe.com/apartments-for-rent/stamford-ct/' },
]
function RentCafeLinks({ zip, town, top }: { zip: string; town: string; top?: boolean }) {
  const links = zip
    ? [{ label: `More ${town ? `${town} ` : ''}${zip} rentals on RentCafe`, href: `https://www.rentcafe.com/apartments-for-rent/${zip}-ct/` }]
    : RENTCAFE_DEFAULTS
  return (
    <div className={`rentcafe-block${top ? ' top' : ''}`}>
      <p className="rentcafe-link">
        {links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
            {l.label} <span aria-hidden="true">↗</span>
          </a>
        ))}
      </p>
      <p className="rentcafe-call">
        Questions about a rental? Call <a href="tel:2038183242">203-818-3242</a>
      </p>
    </div>
  )
}

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = parseFilter(searchParams.get('type'))
  // v68: property type from the header menu (Apartments / Condos / Houses for rent)
  const ptypeRaw = searchParams.get('ptype')
  const ptype = ptypeRaw === 'apartment' || ptypeRaw === 'condo' || ptypeRaw === 'house' ? ptypeRaw : null
  // v62: show cached results instantly (this tab, <15 min), then refresh quietly in the background
  const [listings, setListings] = useState<Listing[]>(() => cachedLiveListings()?.rows ?? [])
  const [loading, setLoading] = useState(() => !cachedLiveListings())
  const [error, setError] = useState('')
  const resultsRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const touchY = useRef<number | null>(null)

  // v42: keep the sticky phone bar exactly below the (wrapping) site header.
  useEffect(() => {
    if (!isMobile) return
    const hdr = document.querySelector('header')
    if (!hdr) return
    const set = () => document.documentElement.style.setProperty('--hdr-h', `${Math.round(hdr.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(hdr)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--hdr-h')
    }
  }, [isMobile])

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
    const c = cachedLiveListings()
    if (c && Date.now() - c.at < 60_000) {
      setLoading(false) // just prefetched: nothing to refresh
      return
    }
    ;(async () => {
      try {
        const rows = await loadLiveListings()
        if (!cancelled) setListings(rows)
      } catch (err) {
        // keep showing cached results if the background refresh fails
        if (!cancelled && !cachedLiveListings()) setError(err instanceof Error ? err.message : 'Failed to load listings')
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
    () => listings.filter((l) => (filter === 'all' || l.type === filter) && (!ptype || l.ptype === ptype)).length,
    [listings, filter, ptype],
  )

  const filtered = useMemo(() => {
    let rows = listings
    if (filter !== 'all') rows = rows.filter((l) => l.type === filter)
    if (ptype) rows = rows.filter((l) => l.ptype === ptype)

    const keyword = norm(keywordQ)
    const zip = norm(zipQ)
    const city = norm(cityQ)
    const street = norm(streetQ)
    const state = norm(stateQ)

    if (keyword) rows = rows.filter((l) => matchesKeyword(l, keyword))
    // ZIP: only rows that have a zip containing the query (empty-zip MLS rows won't match ZIP — use city/street/keyword)
    if (zip) rows = rows.filter((l) => norm(l.zip).includes(zip))
    if (city) rows = rows.filter((l) => matchesCity(l.city, city))
    if (street) rows = rows.filter((l) => norm(l.address).includes(street))
    if (state) rows = rows.filter((l) => norm(l.state).includes(state))
    if (minPrice != null) rows = rows.filter((l) => l.price >= minPrice)
    if (maxPrice != null) rows = rows.filter((l) => l.price <= maxPrice)

    return rows
  }, [listings, filter, ptype, keywordQ, zipQ, cityQ, streetQ, stateQ, minPrice, maxPrice])

  // v65: a full 5-digit CT ZIP in the filter (or the city/keyword box) gives one ZIP-specific RentCafe link (town = most
  // common city among our own listings with that ZIP); no ZIP = the two default links (Fairfield, Stamford)
  const rentCafe = useMemo(() => {
    const zip = [zipQ, keywordQ, cityQ].map((q) => q.trim()).find((q) => /^06\d{3}$/.test(q)) || ''
    if (!zip) return { zip, town: '' }
    const counts = new Map<string, number>()
    for (const l of listings) {
      if ((l.zip || '').slice(0, 5) !== zip || !l.city) continue
      const c = l.city.trim().toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    const town = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    return { zip, town }
  }, [zipQ, keywordQ, cityQ, listings])

  // v59: render the results in pages of 48 cards (more load as you scroll), not all ~2,250 at once
  const [shownCount, setShownCount] = useState(BROWSE_PAGE)
  const moreRef = useRef<HTMLDivElement>(null)
  // v62: reset to the first 48 only when the user changes the search (not when a background refresh lands)
  useEffect(() => {
    setShownCount(BROWSE_PAGE)
  }, [filter, keywordQ, zipQ, cityQ, streetQ, stateQ, minPrice, maxPrice])
  useEffect(() => {
    const el = moreRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShownCount((n) => n + BROWSE_PAGE)
      },
      { rootMargin: '800px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shownCount, filtered.length])

  // v66: if the address bar changes while Search is open (header Search icon, Back/Forward, a link to
  // #/browse?q=...), re-read the filters from it instead of keeping stale ones
  const lastWritten = useRef(searchParams.toString())
  const paramsKey = searchParams.toString()
  useEffect(() => {
    if (paramsKey === lastWritten.current) return
    lastWritten.current = paramsKey
    const sp = new URLSearchParams(paramsKey)
    const g = (k: string) => sp.get(k) ?? ''
    const range = normalizePriceRange(g('min'), g('max'))
    setKeywordDraft(g('q')); setKeywordQ(g('q'))
    setZipDraft(g('zip')); setZipQ(g('zip'))
    setCityDraft(g('city')); setCityQ(g('city'))
    setStreetDraft(g('street')); setStreetQ(g('street'))
    setStateDraft(g('state')); setStateQ(g('state'))
    setMinDraft(g('min')); setMaxDraft(g('max'))
    setMinPrice(range.min); setMaxPrice(range.max)
  }, [paramsKey])

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
    if (ptype && next.type === undefined) params.set('ptype', ptype) // kept while searching; switching tabs clears it
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
    lastWritten.current = params.toString()
    setSearchParams(params, { replace: true })
  }

  function setFilter(next: Filter) {
    writeParams({ type: next })
  }

  function scrollToResults() {
    // Defer so collapse layout settles before scrolling (phones: wait for the short collapse animation)
    const go = () => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (isMobile) window.setTimeout(go, 260)
    else requestAnimationFrame(go)
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

  const ptypeLabel = ptype === 'apartment' ? 'Apartments' : ptype === 'condo' ? 'Condos' : ptype === 'house' ? 'Houses' : ''
  const title = ptypeLabel
    ? `${ptypeLabel} for ${filter === 'sale' ? 'sale' : filter === 'rent' ? 'rent' : 'rent or sale'}`
    : filter === 'rent' ? 'Homes for rent' : filter === 'sale' ? 'Homes for sale' : 'Search homes'

  if (loading) {
    // v62: never a blank page: title + skeleton cards right away while the feed loads
    return (
      <section className="browse-skeleton" aria-busy="true" aria-label="Loading homes">
        <h2 className="section-title" style={{ margin: '0 0 1rem' }}>{title}</h2>
        <div className="grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card skel-card" aria-hidden="true">
              <div className="skel skel-thumb" />
              <div className="body">
                <div className="skel skel-line w60" />
                <div className="skel skel-line w90" />
                <div className="skel skel-line w40" />
              </div>
            </div>
          ))}
        </div>
      </section>
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
        {ptype ? (
          <p className="ptype-chip">
            Showing {ptypeLabel.toLowerCase()} only
            {ptype === 'apartment' ? ' (units in multi-family homes and apartments)' : ''} ·{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                const sp = new URLSearchParams(searchParams)
                sp.delete('ptype')
                setSearchParams(sp, { replace: true })
              }}
            >
              Show all types
            </button>
          </p>
        ) : null}
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

      {isMobile ? (
        <div className={`m-search${searchExpanded ? ' open' : ''}`}>
          <button
            type="button"
            className="m-search-bar"
            aria-expanded={searchExpanded}
            aria-controls="m-search-panel"
            onClick={() => setSearchExpanded((v) => !v)}
            onTouchStart={(e) => {
              touchY.current = e.touches[0]?.clientY ?? null
            }}
            onTouchEnd={(e) => {
              const y0 = touchY.current
              touchY.current = null
              const y1 = e.changedTouches[0]?.clientY
              if (y0 == null || y1 == null) return
              if (y1 - y0 > 28 && !searchExpanded) setSearchExpanded(true)
              else if (y0 - y1 > 28 && searchExpanded) setSearchExpanded(false)
            }}
          >
            <svg className="m-search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M15 15l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className="m-search-summary">
              <strong>{locationActive ? summary : 'Search homes'}</strong>
              <span className="m-search-count">
                {locationActive ? `${filtered.length} of ${typeCount}` : `${typeCount} listings`}
              </span>
            </span>
            <span className="m-search-cta">{searchExpanded ? 'Close' : 'Edit'}</span>
            <svg className="m-search-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div id="m-search-panel" className="m-search-panel" aria-hidden={!searchExpanded}>
            <div className="m-search-inner">
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
            </div>
          </div>
        </div>
      ) : searchExpanded ? (
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
        {filter === 'rent' ? <RentCafeLinks zip={rentCafe.zip} town={rentCafe.town} top /> : null}
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
            {filtered.slice(0, shownCount).map((l) => (
              <Link key={l.id} to={`/listing/${l.id}`} className="card" style={{ color: 'inherit' }}>
                {l.photoDataUrls[0] ? (
                  <img className="thumb" src={l.photoDataUrls[0]} alt="" loading="lazy" decoding="async" />
                ) : (
                  <div className="thumb empty">No photo</div>
                )}
                <div className="body">
                  <span className={`badge ${l.type}`}>{l.type === 'rent' ? 'For rent' : 'For sale'}</span>
                  {l.is_mls ? <span className="badge mls">MLS listing</span> : null}
                  {mlsStatusBadge(l.mlsStatus) ? <span className="badge status" title={l.mlsStatus ?? ''}>{mlsStatusBadge(l.mlsStatus)}</span> : null}
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
        {filtered.length > shownCount ? (
          <div ref={moreRef} className="browse-more">
            <button type="button" className="btn secondary" onClick={() => setShownCount((n) => n + BROWSE_PAGE)}>
              Show more ({(filtered.length - shownCount).toLocaleString()} more)
            </button>
          </div>
        ) : null}
        <RentCafeLinks zip={rentCafe.zip} town={rentCafe.town} />
      </div>
    </div>
  )
}
