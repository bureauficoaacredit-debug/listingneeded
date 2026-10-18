import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BlogCta from '../components/BlogCta'
import { cachedLiveListings, loadLiveListings } from '../lib/store'
import type { Listing } from '../lib/types'
import { ACS_RELEASE, townFacts, usd, zipFacts } from '../lib/ctAcs'
import { RENT_BEDS, rentStats } from '../lib/rentStats'
import { useSeo } from '../lib/seo'

/** v68: average / median asking rent from OUR live rental listings for a CT ZIP (and its town), plus Census median gross rent. */
const BEDS = RENT_BEDS
const stats = rentStats

export default function AverageRent() {
  const [sp, setSp] = useSearchParams()
  // v69: ?town=New Milford (from Search / the menu) or ?zip=06825 (default Fairfield 06825)
  const townOnly = sp.get('zip') ? null : townFacts(sp.get('town') ?? '')
  const zip = townOnly ? '' : /^06\d{3}$/.test(sp.get('zip') ?? '') ? (sp.get('zip') as string) : '06825'
  const [draft, setDraft] = useState(townOnly?.town ?? zip)
  const [listings, setListings] = useState<Listing[] | null>(() => cachedLiveListings()?.rows ?? null)
  const [error, setError] = useState('')
  useEffect(() => setDraft(townOnly?.town ?? zip), [zip, townOnly])
  useEffect(() => {
    if (listings) return
    loadLiveListings().then(setListings, (e) => setError(e instanceof Error ? e.message : 'Could not load listings'))
  }, [listings])

  const census = zip ? zipFacts(zip) : null
  const town = townOnly?.town ?? census?.town ?? null
  const townCensus = town ? townFacts(town) : null
  useSeo(`Average rent in ${town ?? zip}, CT${zip ? ` (${zip})` : ''}`, `Asking rents for ${town ?? zip} ${zip} from live Listing Needed rentals, by bedrooms, plus the Census median gross rent.`)

  const { zipRows, townRows } = useMemo(() => {
    const rent = (listings ?? []).filter((l) => l.type === 'rent' && l.price > 0)
    return {
      zipRows: rent.filter((l) => (l.zip || '').slice(0, 5) === zip),
      townRows: town ? rent.filter((l) => (l.city || '').trim().toLowerCase() === town.toLowerCase() || (townCensus?.zips ?? []).includes((l.zip || '').slice(0, 5))) : [],
    }
  }, [listings, zip, town, townCensus])
  const zs = stats(zipRows)
  const ts = stats(townRows)
  const basis = zip && zs.n >= 3 ? zipRows : townRows

  function submit(e: FormEvent) {
    e.preventDefault()
    const z = draft.trim()
    if (/^06\d{3}$/.test(z)) setSp({ zip: z })
    else if (townFacts(z)) setSp({ town: townFacts(z)!.town })
  }

  return (
    <div className="calc-page">
      <p className="blog-kicker">Rent prices</p>
      <h1>Average rent in {town ?? 'ZIP'}{zip ? ` ${zip}` : ''}</h1>
      <form className="calc-zip" onSubmit={submit}>
        <label>
          Connecticut ZIP or town
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} placeholder="06825 or Stamford" />
        </label>
        <button className="btn" type="submit">Show rents</button>
      </form>
      {zip && !census ? <p className="showing-error">We don't have Census figures for {zip}. Try another Connecticut ZIP.</p> : null}
      {error ? <p className="showing-error">{error}</p> : null}

      <div className="calc-cards">
        {zip ? <div className="calc-card">
          <span>Median asking rent · ZIP {zip}</span>
          <strong>{listings == null ? '…' : zs.n ? `${usd(zs.median)}/mo` : '—'}</strong>
          <small>{listings == null ? 'Loading listings…' : `${zs.n} live rental${zs.n === 1 ? '' : 's'} on Listing Needed${zs.n ? ` · average ${usd(zs.avg)}` : ''}`}</small>
        </div> : null}
        {town ? (
          <div className="calc-card">
            <span>Median asking rent · {town}</span>
            <strong>{listings == null ? '…' : ts.n ? `${usd(ts.median)}/mo` : '—'}</strong>
            <small>{listings == null ? '' : `${ts.n} live rental${ts.n === 1 ? '' : 's'} in town${ts.n ? ` · ${usd(ts.min)}–${usd(ts.max)}` : ''}`}</small>
          </div>
        ) : null}
        <div className="calc-card muted">
          <span>Census median gross rent · {zip || town}</span>
          <strong>{zip ? (census?.medianRent ? `${usd(census.medianRent)}/mo` : '—') : townCensus?.medianRent ? `${usd(townCensus.medianRent)}/mo` : '—'}</strong>
          <small>{zip && townCensus?.medianRent ? `${town} estimate: ${usd(townCensus.medianRent)}/mo · ` : !zip ? 'Town estimate · ' : ''}{ACS_RELEASE}</small>
        </div>
      </div>

      <h2>By bedrooms {zip && zs.n >= 3 ? `(ZIP ${zip})` : town ? `(${town})` : ''}</h2>
      {listings == null ? <p className="meta">Loading…</p> : basis.length ? (
        <table className="calc-table">
          <thead><tr><th>Size</th><th>Listings</th><th>Median rent</th><th>Average</th></tr></thead>
          <tbody>
            {BEDS.map((b) => {
              const s = stats(basis.filter((l) => b.test(Math.round(l.beds))))
              return (
                <tr key={b.label}><td>{b.label}</td><td>{s.n}</td><td>{s.n ? usd(s.median) : '—'}</td><td>{s.n ? usd(s.avg) : '—'}</td></tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="meta">No live rentals here right now. The Census figure above is the long-run typical rent.</p>
      )}
      <p className="calc-links">
        <Link className="btn secondary" to={zip ? `/browse?type=rent&zip=${zip}` : `/browse?type=rent&city=${encodeURIComponent(town ?? '')}`}>See rentals in {zip || town}</Link>{' '}
        <Link className="btn secondary" to="/calculators/rent">How much rent can I afford?</Link>
      </p>
      <p className="calc-note">
        Asking rents come from Listing Needed's own live rental listings (updated hourly) and change as homes are listed and rented.
        The Census figure is the median gross rent (rent plus utilities) paid by renters, {ACS_RELEASE}; town figures combine the town's
        ZIPs and are estimates. Information from public records.
      </p>
      <BlogCta />
    </div>
  )
}
