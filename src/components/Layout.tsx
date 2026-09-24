import { Link, NavLink, Outlet } from 'react-router-dom'
import '../styles/app.css'

/** Soft fat green triangle (Realtor Marcel style) with two slanted eyes. */
function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 48 48"
      width="44"
      height="44"
      aria-hidden="true"
      focusable="false"
    >
      {/* Soft/puffy mountain-triangle body */}
      <path
        className="brand-mark-body"
        d="M24 5.5
           C27.2 5.5 31.5 14.5 36.8 26.8
           C39.2 32.4 40.5 36.8 39.6 39.4
           C38.5 42.6 33.2 44.5 24 44.5
           C14.8 44.5 9.5 42.6 8.4 39.4
           C7.5 36.8 8.8 32.4 11.2 26.8
           C16.5 14.5 20.8 5.5 24 5.5Z"
        fill="#3FA34A"
      />
      {/* Left eye — soft vertical oval, tilted in */}
      <ellipse
        className="brand-mark-eye brand-mark-eye--left"
        cx="18.2"
        cy="27.5"
        rx="2.6"
        ry="4.4"
        transform="rotate(-14 18.2 27.5)"
        fill="#142018"
      />
      {/* Right eye — winks on brand hover */}
      <ellipse
        className="brand-mark-eye brand-mark-eye--right"
        cx="29.8"
        cy="27.5"
        rx="2.6"
        ry="4.4"
        transform="rotate(14 29.8 27.5)"
        fill="#142018"
      />
    </svg>
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

export default function Layout() {
  return (
    <div className="shell">
      <header className="nav">
        <Link to="/" className="brand" aria-label="Listing Needed home">
          <BrandMark />
          <span className="brand-wordmark">LISTING NEEDED</span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <NavLink
            to="/browse"
            className={({ isActive }) => `nav-search${isActive ? ' active' : ''}`}
            aria-label="Search"
            title="Search"
          >
            <SearchIcon />
          </NavLink>
          <NavLink
            to="/list"
            className={({ isActive }) => `nav-list-btn${isActive ? ' active' : ''}`}
          >
            List your home
          </NavLink>
          <a className="nav-phone" href="tel:2038183242">
            203-818-3242
          </a>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <div className="contact">
            <strong>Listing Needed · Marcel Najar</strong>
            <div className="meta">Licensed Realtor® · Fairfield County, CT · Buy · Sell · Rent</div>
            <div>
              <a href="https://www.listingneeded.com">www.listingneeded.com</a> ·{' '}
              <a href="tel:2038183242">203-818-3242</a>
            </div>
            <div className="meta" style={{ marginTop: '.5rem' }}>
              <Link to="/admin" style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 500 }}>
                Admin
              </Link>
            </div>
          </div>
          <img className="qr" src="/qr.png" alt="QR code for listingneeded.com" />
        </div>
      </footer>
    </div>
  )
}
