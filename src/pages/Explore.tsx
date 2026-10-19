import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AvgRentPanel from '../components/AvgRentPanel'
import ListingCard from '../components/ListingCard'
import { cachedLiveListings, loadLiveListings } from '../lib/store'
import { airbnbUrl, openOutside, rentCafeUrl, type OutboundTo } from '../lib/outbound'
import { canonicalTown, townFacts } from '../lib/ctAcs'
import { useSeo } from '../lib/seo'
import type { Listing } from '../lib/types'

/**
 * v71: the page this tab lands on when a visitor opens Airbnb or RentCafe from Search (the outside site opens in a new
 * tab). Keeps them on Listing Needed: re-open link, back to their search, average rent, our listings in that town.
 */
const SITE: Record<OutboundTo, string> = { airbnb: 'Airbnb', rentcafe: 'RentCafe' }
const SHOW = 12

export default function Explore() {
  const [sp] = useSearchParams()
  const to: OutboundTo = sp.get('to') === 'rentcafe' ? 'rentcafe' : 'airbnb'
  const state = (sp.get('state') || 'CT').toUpperCase()
  const zip = /^\d{5}$/.test(sp.get('zip') ?? '') ? sp.get('zip')! : ''
  const town = (sp.get('town') ?? '').trim()
  const back = (sp.get('back') ?? '').startsWith('/browse') ? sp.get('back')! : '/browse'
  const site = SITE[to]
  const place = town ? `${town}${zip ? ` ${zip}` : ''}` : zip || 'Connecticut'
  const outside = to === 'airbnb' ? airbnbUrl(town || 'Fairfield', state) : rentCafeUrl(zip, town || 'Fairfield')
  useSeo(`${place} rentals & homes | Listing Needed`, `Rentals and homes in ${place} on Listing Needed, with average rent and Census figures.`)

  useEffect(() => window.scrollTo(0, 0), [])
  const [listings, setListings] = useState<Listing[] | null>(() => cachedLiveListings()?.rows ?? null)
  useEffect(() => {
    if (!cachedLiveListings()) loadLiveListings().then(setListings, () => setListings([]))
  }, [])

  const { inTown, nearby } = useMemo(() => {
    const rows = listings ?? []
    const tf = town ? townFacts(town) : null
    const canon = tf?.town ?? canonicalTown(town)
    const match = (l: Listing) =>
      zip ? (l.zip || '').slice(0, 5) === zip || (!!canon && canonicalTown(l.city) === canon) : !!canon ? canonicalTown(l.city) === canon || (tf?.zips ?? []).includes((l.zip || '').slice(0, 5)) : false
    const rentFirst = (a: Listing, b: Listing) => (a.type === b.type ? 0 : a.type === 'rent' ? -1 : 1)
    const inTown = rows.filter(match).sort(rentFirst)
    const nearby = inTown.length ? [] : rows.filter((l) => l.type === 'rent' && (l.state || 'CT').toUpperCase() === 'CT')
    return { inTown, nearby }
  }, [listings, town, zip])

  const seeAll = zip ? `/browse?zip=${zip}` : town ? `/browse?city=${encodeURIComponent(town)}` : '/browse?type=rent'
  const rentals = inTown.filter((l) => l.type === 'rent').length

  return (
    <div className="explore">
      <section className="explore-hero" role="status">
        <p className="explore-icon" aria-hidden="true">↗</p>
        <h1>{site} opened in a new tab.</h1>
        <p>Your Listing Needed search is still here.</p>
        <div className="explore-actions">
          <a className="btn secondary" href={outside} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); openOutside(outside) }}>
            Re-open {site} ↗
          </a>
          <Link className="btn" to={back}>← Back to your search</Link>
        </div>
        <p className="meta explore-tip">Didn't see a new tab? Your browser may have blocked it; use “Re-open {site}”.</p>
      </section>

      {state === 'CT' ? <AvgRentPanel listings={listings ?? []} zipQ={zip} keywordQ="" cityQ={town} /> : null}

      <section className="explore-list">
        {listings == null ? <p className="meta">Loading listings…</p> : inTown.length ? (
          <>
            <h2>Listings in {place} on Listing Needed</h2>
            <p className="meta">{rentals} rental{rentals === 1 ? '' : 's'} and {inTown.length - rentals} home{inTown.length - rentals === 1 ? '' : 's'} for sale · rentals first</p>
            <div className="grid">{inTown.slice(0, SHOW).map((l) => <ListingCard key={l.id} l={l} />)}</div>
            {inTown.length > SHOW ? <p className="explore-more"><Link className="btn secondary" to={seeAll}>See all {inTown.length} in {place} →</Link></p> : null}
          </>
        ) : (
          <>
            <h2>No Listing Needed listings in {place} right now</h2>
            <p className="meta">Here are Connecticut rentals listed with us{town ? '; the average rent panel above shows the Census rent for ' + town : ''}.</p>
            <div className="grid">{nearby.slice(0, SHOW).map((l) => <ListingCard key={l.id} l={l} />)}</div>
            <p className="explore-more"><Link className="btn secondary" to="/browse?type=rent">See all Connecticut rentals →</Link></p>
          </>
        )}
      </section>

      <section className="explore-cta card">
        <div className="body">
          <h2>Questions? Talk to Marcel</h2>
          <p>Marcel Najar, Licensed Realtor®, Fairfield County, CT. Call or text <a href="tel:2038183242"><strong>203-818-3242</strong></a>.</p>
          <div className="explore-actions">
            <a className="btn secondary" href="tel:2038183242">Call 203-818-3242</a>
            <Link className="btn" to="/list">List your home</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
