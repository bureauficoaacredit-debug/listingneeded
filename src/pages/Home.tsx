import { Link } from 'react-router-dom'
import { LISTING_FEE_USD } from '../lib/types'

export default function Home() {
  return (
    <div style={{display:'grid', gap:'1.25rem'}}>
      <section className="hero">
        <div>
          <h1>List your home. Get contacted. No middleman.</h1>
          <p>
            Self-serve listings for rent or sale. Pay ${LISTING_FEE_USD} once, your listing goes live,
            and interested people contact you directly — fully automated.
          </p>
          <div className="hero-actions">
            <Link className="btn big" to="/list">List my home — ${LISTING_FEE_USD}</Link>
            <Link className="btn secondary" to="/browse">Browse live listings</Link>
          </div>
        </div>
      </section>
      <section className="grid">
        <div className="card"><div className="body"><h3>1. Enter your home</h3><p className="meta">Address, price, photos, and your contact info.</p></div></div>
        <div className="card"><div className="body"><h3>2. Pay ${LISTING_FEE_USD}</h3><p className="meta">One-time listing fee. Listing activates after payment.</p></div></div>
        <div className="card"><div className="body"><h3>3. Get contacted</h3><p className="meta">Buyers and renters reach you by phone or email. You’re in control.</p></div></div>
      </section>
    </div>
  )
}
