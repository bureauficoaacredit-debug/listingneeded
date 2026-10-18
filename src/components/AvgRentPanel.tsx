import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Listing } from '../lib/types'
import { money, rentByBeds, rentStats } from '../lib/rentStats'
import { setLastTown } from '../lib/lastTown'

/**
 * v69: "Average rent in <town>" dropdown at the top of Search results when the search names a CT town or ZIP.
 * Uses the Search feed already in memory (no extra request); Census figures come from the bundled ACS file, loaded
 * on demand in its own small chunk.
 */
type Acs = typeof import('../lib/ctAcs')
let acsPromise: Promise<Acs> | null = null
const loadAcs = () => (acsPromise ??= import('../lib/ctAcs'))

const STATE_WORDS = new Set(['ct', 'conn', 'connecticut', 'usa', 'us'])
const words = (s: string) => s.toLowerCase().replace(/[.,;:#/()]+/g, ' ').split(/\s+/).filter(Boolean)
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

export default function AvgRentPanel({ listings, zipQ, keywordQ, cityQ }: { listings: Listing[]; zipQ: string; keywordQ: string; cityQ: string }) {
  const [acs, setAcs] = useState<Acs | null>(null)
  const active = Boolean(zipQ.trim() || keywordQ.trim() || cityQ.trim())
  useEffect(() => {
    if (active && !acs) loadAcs().then(setAcs, () => {})
  }, [active, acs])

  // what was searched: a ZIP wins; otherwise the exact town name typed in City or the keyword box
  const target = useMemo(() => {
    const all = [zipQ, keywordQ, cityQ].join(' ')
    const zip = all.match(/\b06\d{3}\b/)?.[0]
    if (zip) return { zip, town: acs?.zipFacts(zip)?.town ?? null }
    for (const q of [cityQ, keywordQ]) {
      const w = words(q).filter((x) => !STATE_WORDS.has(x)).join(' ')
      if (!w) continue
      const fromAcs = acs?.townFacts(w)?.town
      if (fromAcs) return { zip: null, town: fromAcs }
      if (listings.some((l) => (l.city || '').trim().toLowerCase() === w)) return { zip: null, town: title(w) }
    }
    return null
  }, [zipQ, keywordQ, cityQ, acs, listings])

  const data = useMemo(() => {
    if (!target) return null
    const tf = target.town && acs ? acs.townFacts(target.town) : null
    const rent = listings.filter((l) => l.type === 'rent')
    const rows = target.zip
      ? rent.filter((l) => (l.zip || '').slice(0, 5) === target.zip)
      : tf && acs
        ? rent.filter((l) => acs.listingInTown(l, tf))
        : rent.filter((l) => (l.city || '').trim().toLowerCase() === target.town!.toLowerCase())
    const census = target.zip ? acs?.zipFacts(target.zip)?.medianRent ?? null : tf?.medianRent ?? null
    return { rows, stats: rentStats(rows), beds: rentByBeds(rows), census, release: acs?.ACS_RELEASE ?? '' }
  }, [target, listings, acs])

  useEffect(() => {
    if (target?.town || target?.zip) setLastTown({ town: target.town || `ZIP ${target.zip}`, zip: target.zip ?? undefined })
  }, [target])

  if (!target || !data) return null
  if (data.stats.n === 0 && !data.census) return null
  const place = target.zip ? `${target.town ? `${target.town} ` : ''}${target.zip}` : target.town!
  const n = data.stats.n
  const few = n > 0 && n < 3
  const none = `No ${place} rentals listed right now`
  const pageHref = target.zip ? `/average-rent?zip=${target.zip}` : `/average-rent?town=${encodeURIComponent(target.town!)}`
  const rentHref = target.zip ? `/browse?type=rent&zip=${target.zip}` : `/browse?type=rent&city=${encodeURIComponent(target.town!)}`

  return (
    <details className="avg-rent-panel">
      <summary>
        <span>
          {n ? (
            <>
              Average rent in {place}: <strong>{money(data.stats.avg)}/mo</strong>{' '}
              <em>median {money(data.stats.median)} · from {n} rental{n === 1 ? '' : 's'}</em>
              {few ? <b className="avg-rent-few">few listings</b> : null}
            </>
          ) : (
            <>Rent in {place}: Census median <strong>{money(data.census)}/mo</strong> <em>{none}</em></>
          )}
        </span>
        <span className="avg-rent-caret" aria-hidden="true">▾</span>
      </summary>
      <div className="avg-rent-body">
        {n ? (
          <>
            <p className="avg-rent-line">
              Average <strong>{money(data.stats.avg)}</strong> · median {money(data.stats.median)} · from {n} live rental{n === 1 ? '' : 's'} on Listing Needed
              {few ? ' (few listings, so treat this as a rough guide)' : ''}
            </p>
            <table className="calc-table">
              <thead><tr><th>Size</th><th>Rentals</th><th>Average</th><th>Median</th></tr></thead>
              <tbody>
                {data.beds.map((b) => (
                  <tr key={b.label}><td>{b.label}</td><td>{b.n}</td><td>{b.n ? money(b.avg) : '—'}</td><td>{b.n ? money(b.median) : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="avg-rent-line">{none}. The Census figure below is what renters there pay.</p>
        )}
        {data.census ? (
          <p className="avg-rent-line">
            Census median gross rent{target.zip ? ` (ZIP ${target.zip})` : target.town ? ` (${target.town}, estimate)` : ''}: <strong>{money(data.census)}/mo</strong>
          </p>
        ) : null}
        <p className="avg-rent-links">
          <Link to={pageHref}>See full Average rent page →</Link>
          <Link to={rentHref}>See rentals in {place} →</Link>
        </p>
        <p className="calc-note">
          Average = total of asking rents ÷ number of live rentals on Listing Needed (rents under $300 or over $40,000 left out as typos). Census: {data.release || 'ACS 5-year'}. Information from public records.
        </p>
      </div>
    </details>
  )
}
