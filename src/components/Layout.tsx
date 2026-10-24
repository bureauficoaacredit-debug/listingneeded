import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { A2hsBar } from './AddToHomeScreen'
import { prefetchLiveListings } from '../lib/store'
import '../styles/app.css'
import HeaderMenu from './HeaderMenu'

/** v68: round pinwheel "L" icon (same art as the favicon) beside the wordmark; the ring spins once on hover. */
function RingMark() {
  return (
    <svg className="brand-ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">
      <g className="ln-blades" stroke="#fff" strokeWidth="1.1" strokeLinejoin="round"><path fill="#8227BE" d="M26.70 17.43 Q27.94 7.72 43.76 2.89 A31.4 31.4 0 0 1 61.11 43.76 Q56.28 27.94 46.57 26.70 A15.5 15.5 0 0 0 26.70 17.43 Z"/><path fill="#EC4899" d="M46.57 26.70 Q56.28 27.94 61.11 43.76 A31.4 31.4 0 0 1 20.24 61.11 Q36.06 56.28 37.30 46.57 A15.5 15.5 0 0 0 46.57 26.70 Z"/><path fill="#FACC15" d="M37.30 46.57 Q36.06 56.28 20.24 61.11 A31.4 31.4 0 0 1 2.89 20.24 Q7.72 36.06 17.43 37.30 A15.5 15.5 0 0 0 37.30 46.57 Z"/><path fill="#EF4444" d="M17.43 37.30 Q7.72 36.06 2.89 20.24 A31.4 31.4 0 0 1 43.76 2.89 Q27.94 7.72 26.70 17.43 A15.5 15.5 0 0 0 17.43 37.30 Z"/></g><circle cx="32" cy="32" r="17" fill="#4E1772"/><path fill="#fff" d="M25 21.5h6.2v15h9.3v6H25Z"/>
    </svg>
  )
}

/** v32 wordmark: transparent PNG traced from Marcel's logo (white on the blue header), 1x/2x/3x. */
function BrandLogo() {
  return (
    <img
      className="brand-logo"
      src="/logo/logo-white@2x.png"
      srcSet="/logo/logo-white.png 1x, /logo/logo-white@2x.png 2x, /logo/logo-white@3x.png 3x"
      width={462}
      height={45}
      alt="Listing Needed"
      decoding="async"
    />
  )
}

function SearchIcon() {
  return (
    <svg
      className="nav-search-icon"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.6" />
      <line
        x1="15.5"
        y1="15.5"
        x2="21"
        y2="21"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg
      className="nav-phone-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7.5 3.75h2.2l1.1 4.4-1.7 1.05a12.5 12.5 0 0 0 5.7 5.7l1.05-1.7 4.4 1.1v2.2A1.75 1.75 0 0 1 18.5 18.3C10.7 18.3 5.7 13.3 5.7 5.5A1.75 1.75 0 0 1 7.5 3.75Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Layout() {
  const isHome = useLocation().pathname === '/'
  // v62: start loading the Search feed the moment a finger/mouse touches any Search link (header, hero, For Rent/Sale)
  useEffect(() => {
    const onIntent = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#/browse"]')
      if (a) prefetchLiveListings()
    }
    document.addEventListener('pointerover', onIntent, { passive: true })
    document.addEventListener('touchstart', onIntent, { passive: true })
    document.addEventListener('focusin', onIntent)
    return () => {
      document.removeEventListener('pointerover', onIntent)
      document.removeEventListener('touchstart', onIntent)
      document.removeEventListener('focusin', onIntent)
    }
  }, [])
  return (
    <div className="shell">
      <header className="nav">
        <div className="nav-left">
          <HeaderMenu />
          <Link to="/" className="brand" aria-label="Listing Needed home">
            <RingMark />
            <BrandLogo />
          </Link>
        </div>
        <nav className="nav-links" aria-label="Primary">
          <NavLink
            to="/browse"
            className={({ isActive }) => `nav-search${isActive ? ' active' : ''}`}
            aria-label="Search"
            title="Search"
          >
            <SearchIcon />
          </NavLink>
          <NavLink to="/blog" className={({ isActive }) => `nav-blog${isActive ? ' active' : ''}`}>
            Blog
          </NavLink>
          <NavLink
            to="/list"
            className={({ isActive }) => `nav-list-btn${isActive ? ' active' : ''}`}
          >
            <span className="nav-list-full">List your home</span>
            <span className="nav-list-short">List</span>
          </NavLink>
          <a className="nav-phone" href="tel:2038183242" aria-label="Call 203-818-3242" title="203-818-3242">
            <span className="nav-phone-text">203-818-3242</span>
            <PhoneIcon />
          </a>
        </nav>
      </header>
      <main>
        <Outlet />
        {isHome ? <A2hsBar /> : null}
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <div className="contact">
            <img
              className="footer-logo"
              src="/logo/logo-dark@2x.png"
              srcSet="/logo/logo-dark.png 1x, /logo/logo-dark@2x.png 2x, /logo/logo-dark@3x.png 3x"
              width={462}
              height={45}
              alt="Listing Needed"
              loading="lazy"
            />
            <strong>Listing Needed · Marcel Najar</strong>
            <div className="meta">Licensed Realtor® · Fairfield County, CT · Buy · Sell · Rent</div>
            <div>
              <a href="https://www.listingneeded.com">www.listingneeded.com</a> ·{' '}
              <a href="tel:2038183242">203-818-3242</a>
            </div>
            {/* v79: approved exception to v72 no-outbound — Marcel's Realtor.com agent profile (footer only) */}
            <div style={{ marginTop: '.4rem' }}>
              <a
                className="realtor-profile-btn"
                href="https://www.realtor.com/realestateagents/56b0887589a68901006c5685"
                target="_blank"
                rel="noopener"
              >
                See me on Realtor.com
              </a>
            </div>
            <div className="meta" style={{ marginTop: '.5rem' }}>
              <Link to="/cma" style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 500 }}>
                What’s my home worth?
              </Link>{' '}
              ·{' '}
              <Link to="/blog" style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 500 }}>
                Blog
              </Link>{' '}
              ·{' '}
              <Link to="/admin" style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 500 }}>
                Admin
              </Link>
            </div>
            <div className="footer-records">
              <span className="footer-records-title">Public records:</span>{' '}
              <a href="https://www.vgsi.com/connecticut-online-database/" target="_blank" rel="noopener noreferrer">Town assessor (CT)</a> ·{' '}
              <a href="https://civilinquiry.jud.ct.gov/PropertySearch.aspx" target="_blank" rel="noopener noreferrer">CT court property search (foreclosures)</a> ·{' '}
              <a href="https://civilinquiry.jud.ct.gov/PartySearch.aspx" target="_blank" rel="noopener noreferrer">CT court party search (evictions)</a> ·{' '}
              <a href="https://www.uslandrecords.com/ctlr/" target="_blank" rel="noopener noreferrer">CT land records</a> ·{' '}
              <a href="https://service.ct.gov/business/s/onlinebusinesssearch" target="_blank" rel="noopener noreferrer">CT business registry</a>
              <div>Information from public records.</div>
            </div>
          </div>
          <img className="qr" src="/qr.png" alt="QR code for listingneeded.com" />
        </div>
      </footer>
    </div>
  )
}
