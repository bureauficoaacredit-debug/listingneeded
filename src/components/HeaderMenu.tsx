import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { averageRentHref, getLastTown, subscribeLastTown } from '../lib/lastTown'
import { Link, useLocation } from 'react-router-dom'

/**
 * v68: left hamburger menu. Desktop: dropdown with flyout submenus (hover or keyboard). Phone: slide-in panel with
 * expandable sections. Pages it links to are lazy-loaded, so the menu adds no weight to Search.
 */
type Item = { label: string; to: string }
type Group = { label: string; to?: string; items?: Item[] }

const MENU: Group[] = [
  {
    label: 'Rental Type',
    items: [
      { label: 'Apartments for Rent', to: '/browse?type=rent&ptype=apartment' },
      { label: 'Condos for Rent', to: '/browse?type=rent&ptype=condo' },
      { label: 'Houses for Rent', to: '/browse?type=rent&ptype=house' },
      { label: 'Short-term Stays', to: '/browse?type=short-term' },
      { label: 'Homes for Sale', to: '/browse?type=sale' },
    ],
  },
  { label: 'AVERAGE_RENT', to: '/average-rent?zip=06825' }, // v69: follows the last searched town
  {
    label: 'Blog',
    to: '/blog',
    items: [
      { label: 'All articles', to: '/blog' },
      { label: 'Reporting your landlord', to: '/blog/landlord-reviews' },
    ],
  },
  {
    label: 'Calculators',
    items: [
      { label: 'Rent Calculator', to: '/calculators/rent' },
      { label: 'Cost of Living Calculator', to: '/calculators/cost-of-living' },
      { label: 'Rent vs. Buy Calculator', to: '/calculators/rent-vs-buy' },
    ],
  },
  { label: "What's My Home Worth?", to: '/cma' },
  { label: 'List Your Home', to: '/list' },
]

export default function HeaderMenu() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  const last = useSyncExternalStore(subscribeLastTown, getLastTown, getLastTown)

  // close on navigation
  useEffect(() => {
    setOpen(false)
    setExpanded(null)
  }, [loc.pathname, loc.search])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <div className={`hmenu${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        className="hmenu-btn"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="hmenu-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="hmenu-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
      <div className="hmenu-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />
      <nav id="hmenu-panel" className="hmenu-panel" aria-label="Menu" hidden={!open}>
        <div className="hmenu-head">
          <span>Menu</span>
          <button type="button" className="hmenu-close" aria-label="Close menu" onClick={() => setOpen(false)}>×</button>
        </div>
        <ul className="hmenu-list">
          {MENU.map((g) =>
            g.items ? (
              <li key={g.label} className={`hmenu-group${expanded === g.label ? ' expanded' : ''}`}>
                <button
                  type="button"
                  className="hmenu-item hmenu-parent"
                  aria-expanded={expanded === g.label}
                  onClick={() => setExpanded((x) => (x === g.label ? null : g.label))}
                >
                  {g.label}
                  <span className="hmenu-caret" aria-hidden="true">›</span>
                </button>
                <ul className="hmenu-sub">
                  {g.items.map((it) => (
                    <li key={it.to}>
                      <Link className="hmenu-item" to={it.to}>{it.label}</Link>
                    </li>
                  ))}
                </ul>
              </li>
            ) : (
              <li key={g.label}>
                {g.label === 'AVERAGE_RENT' ? (
                  <Link className="hmenu-item" to={averageRentHref(last)}>Average Rent in {last.town}</Link>
                ) : (
                  <Link className="hmenu-item" to={g.to!}>{g.label}</Link>
                )}
              </li>
            ),
          )}
        </ul>
        <a className="hmenu-call" href="tel:2038183242">Call/text Marcel Najar · 203-818-3242</a>
      </nav>
    </div>
  )
}
