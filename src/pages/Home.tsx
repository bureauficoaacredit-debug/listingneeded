import { Link } from 'react-router-dom'
import { LISTING_FEE_RENT_USD, LISTING_FEE_SALE_USD } from '../lib/types'

export default function Home() {
  return (
    <div style={{display:'grid', gap:'1.25rem'}}>
      <section className="hero">
        <div>
          <h1>Buy. Sell. Rent.</h1>
          <p>
            Looking for a home? Browse live places for sale and for rent — contact owners directly.
          </p>
          <p>
            Own a home? Fully automated listings: sell for ${LISTING_FEE_SALE_USD} or rent for
            ${LISTING_FEE_RENT_USD}. Pay online, go live, and get contacted — no agent in the middle.
          </p>
          <p>
            Prefer a Realtor® to represent you? Call for a consultation and we’ll discuss the best
            option for your property.
          </p>
          <div className="hero-actions">
            <Link className="btn big" to="/browse">Find a home — buy or rent</Link>
            <Link className="btn secondary" to="/list">List my home — from ${LISTING_FEE_RENT_USD}</Link>
          </div>
        </div>
      </section>
      <section className="grid">
        <div className="card"><div className="body"><h3>Find a place</h3><p className="meta">Browse homes for sale and for rent. Reach owners by phone or email.</p></div></div>
        <div className="card"><div className="body"><h3>List your home</h3><p className="meta">Rent for ${LISTING_FEE_RENT_USD} or sell for ${LISTING_FEE_SALE_USD}. Fully automated after payment.</p></div></div>
        <div className="card"><div className="body"><h3>Talk to a Realtor®</h3><p className="meta">Want representation and guidance? Call Marcel for a consultation.</p></div></div>
      </section>
      <section className="card"><div className="body">
        <h3>Buy it. Sell it. Rent it. Or let a professional handle it for you.</h3>
        <p className="meta">Marcel Najar · <a href="https://www.listingneeded.com">www.listingneeded.com</a> · <a href="tel:2038183242">203-818-3242</a></p>
      </div></section>
    </div>
  )
}
