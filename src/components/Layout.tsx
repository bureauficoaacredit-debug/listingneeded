import { Link, NavLink, Outlet } from 'react-router-dom'
import '../styles/app.css'

export default function Layout() {
  return (
    <div className="shell">
      <header className="nav">
        <Link to="/" className="brand"><span className="brand-listing">Listing</span> <span className="brand-needed">Needed</span></Link>
        <nav className="nav-links">
          <NavLink to="/browse" className={({isActive}) => isActive ? 'active' : ''}>Search</NavLink>
          <NavLink to="/list" className={({isActive}) => isActive ? 'active' : ''}>List your home</NavLink>
          <a href="tel:2038183242">203-818-3242</a>
        </nav>
      </header>
      <main><Outlet /></main>
      <footer className="footer">
        <div className="footer-inner">
          <div className="contact">
            <strong>Listing Needed · Marcel Najar</strong>
            <div className="meta">Licensed Realtor® · Fairfield County, CT · Buy · Sell · Rent</div>
            <div><a href="https://www.listingneeded.com">www.listingneeded.com</a> · <a href="tel:2038183242">203-818-3242</a></div>
            <div className="meta" style={{marginTop:'.5rem'}}>
              <Link to="/admin" style={{color:'var(--muted)', fontSize:'0.8rem', fontWeight:500}}>Admin</Link>
            </div>
          </div>
          <img className="qr" src="/qr.png" alt="QR code for listingneeded.com" />
        </div>
      </footer>
    </div>
  )
}
