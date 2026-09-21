import { Link } from 'react-router-dom'
import { LISTING_FEE_RENT_USD, LISTING_FEE_SALE_USD } from '../lib/types'

export default function Home() {
  return (
    <div style={{display:'grid', gap:'1.25rem'}}>
      <section className="hero">
        <div>
          <h1>Thinking about selling or renting your home?</h1>
          <p>
            You can list your home for sale for only ${LISTING_FEE_SALE_USD}, or list it for rent starting
            at just ${LISTING_FEE_RENT_USD}. Your listing goes live after payment and interested people
            contact you directly.
          </p>
          <p>
            Want a Realtor® to represent you, handle the process, and guide you through your options?
            We’re here to help. Call today for a consultation and let’s discuss the best option for your property.
          </p>
          <div className="hero-actions">
            <Link className="btn big" to="/list">List my home — from ${LISTING_FEE_RENT_USD}</Link>
            <Link className="btn secondary" to="/browse">Browse live listings</Link>
          </div>
        </div>
      </section>
      <section className="grid">
        <div className="card"><div className="body"><h3>1. Enter your home</h3><p className="meta">Address, price, photos, and your contact info.</p></div></div>
        <div className="card"><div className="body"><h3>2. Choose your listing</h3><p className="meta">Rent for ${LISTING_FEE_RENT_USD} or sell for ${LISTING_FEE_SALE_USD}. Your listing activates after payment.</p></div></div>
        <div className="card"><div className="body"><h3>3. Get contacted</h3><p className="meta">Buyers and renters reach you by phone or email. You’re in control.</p></div></div>
      </section>
      <section className="card"><div className="body">
        <h3>Sell it. Rent it. Or let a professional handle it for you.</h3>
        <p className="meta">Marcel Najar · <a href="https://www.listingneeded.com">www.listingneeded.com</a> · <a href="tel:2038183242">203-818-3242</a></p>
      </div></section>
    </div>
  )
}
