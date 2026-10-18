import { Link } from 'react-router-dom'
import { LISTING_FEE_RENT_USD, LISTING_FEE_SALE_USD } from '../lib/types'

/** v64: call-to-action box at the end of every blog article. */
export default function BlogCta() {
  return (
    <aside className="blog-cta" aria-label="List your home on Listing Needed">
      <p className="blog-cta-kicker">Listing Needed</p>
      <h2>List your home on Listing Needed</h2>
      <p>
        Fully automated, do-it-yourself listings for Connecticut homes: ${LISTING_FEE_RENT_USD} to rent or ${LISTING_FEE_SALE_USD} to sell,
        and buyers and renters contact you directly.
      </p>
      <div className="blog-cta-actions">
        <Link className="btn" to="/list">List your home</Link>
        <a className="btn secondary" href="tel:2038183242">Call/text Marcel Najar ·<span style={{ whiteSpace: 'nowrap' }}>203-818-3242</span></a>
      </div>
      <p className="blog-cta-site">
        <a href="https://www.listingneeded.com">www.listingneeded.com</a>
      </p>
    </aside>
  )
}
