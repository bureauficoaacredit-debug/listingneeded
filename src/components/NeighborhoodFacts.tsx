import { useEffect, useRef, useState } from 'react'
import type { Listing } from '../lib/types'

type Census = {
  release: string
  medianIncome: number | null
  incomeTopCoded: boolean
  ownerPct: number | null
  renterPct: number | null
  medianValue: number | null
  valueTopCoded: boolean
  medianRent: number | null
  rentTopCoded: boolean
}
type School = { name: string; grades: string; city: string; miles: number }
type Facts = { found: boolean; zip: string; census: Census | null; schools: School[]; schoolsDistanceFrom: 'home' | 'zip' | null }

const money = (n: number, top: boolean) => (top ? `$${(n - 1).toLocaleString()}+` : `$${n.toLocaleString()}`)

/**
 * v52 "Neighborhood facts" (under the map): ZIP-level Census ACS 5-year numbers + nearest public schools (NCES).
 * Loads only when scrolled near, cached by the CDN (/api/neighborhood) and per session; hidden when nothing comes back.
 * Fair housing: no ratings, crime, poverty or demographic data.
 */
export default function NeighborhoodFacts({ listing }: { listing: Listing }) {
  const zip = String(listing.zip || '').trim().slice(0, 5)
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [facts, setFacts] = useState<Facts | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    if (typeof IntersectionObserver === 'undefined') return setVisible(true)
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible || !/^\d{5}$/.test(zip)) return
    const qs = new URLSearchParams({ zip, address: listing.address || '', city: listing.city || '', state: listing.state || '' })
    const key = `ln_nbhd_${qs}`
    try {
      const hit = sessionStorage.getItem(key)
      if (hit) return setFacts(JSON.parse(hit))
    } catch {
      /* ignore */
    }
    let alive = true
    fetch(`/api/neighborhood?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Facts) => {
        if (!alive) return
        setFacts(d)
        try {
          sessionStorage.setItem(key, JSON.stringify(d))
        } catch {
          /* ignore */
        }
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [visible, zip, listing.address, listing.city, listing.state])

  if (!/^\d{5}$/.test(zip) || failed || (facts && !facts.found)) return null
  if (!facts) return <section ref={ref} className="nbhd nbhd-pending" aria-hidden="true" />

  const c = facts.census
  const stats: { label: string; value: string; sub?: string }[] = []
  if (c?.medianIncome != null) stats.push({ label: 'Median household income', value: money(c.medianIncome, c.incomeTopCoded) })
  if (c?.medianValue != null) stats.push({ label: 'Median home value', value: money(c.medianValue, c.valueTopCoded) })
  if (c?.medianRent != null) stats.push({ label: 'Median gross rent', value: `${money(c.medianRent, c.rentTopCoded)}/mo` })
  if (c?.ownerPct != null && c?.renterPct != null)
    stats.push({ label: 'Homes owner / renter occupied', value: `${Math.round(c.ownerPct)}% / ${Math.round(c.renterPct)}%` })

  return (
    <section ref={ref} className="nbhd" aria-label="Neighborhood facts">
      <div className="listing-map-head">
        <h3>Neighborhood facts</h3>
        <span className="nbhd-zip">ZIP {facts.zip}</span>
      </div>
      {stats.length ? (
        <>
          <div className="nbhd-ownbar" aria-hidden="true" hidden={c?.ownerPct == null}>
            <span style={{ width: `${c?.ownerPct ?? 0}%` }} />
          </div>
          <dl className="nbhd-grid">
            {stats.map((s) => (
              <div key={s.label} className="nbhd-stat">
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      {facts.schools.length ? (
        <div className="nbhd-schools">
          <h4>
            Nearby public schools{' '}
            <span className="meta">{facts.schoolsDistanceFrom === 'home' ? '(distance from this home)' : '(distance from ZIP center)'}</span>
          </h4>
          <ul>
            {facts.schools.map((s) => (
              <li key={`${s.name}-${s.miles}`}>
                <span className="nbhd-school-name">{s.name}</span>
                <span className="nbhd-school-meta">
                  {s.grades ? `Grades ${s.grades}` : ''}
                  {s.grades ? ' · ' : ''}
                  {s.miles.toFixed(1)} mi
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="nbhd-note">Information from public records</p>
      <p className="nbhd-source">
        Source: U.S. Census Bureau ACS{c?.release ? ` ${c.release.replace('ACS ', '')}` : ''} (ZIP code area), NCES
      </p>
    </section>
  )
}
