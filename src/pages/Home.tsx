import { Link } from 'react-router-dom'
import PartnerResources from '../components/PartnerResources'
import { LISTING_FEE_RENT_USD, LISTING_FEE_SALE_USD } from '../lib/types'

export default function Home() {
  return (
    <div className="home">
      <section className="hero hero-centered">
        <p className="eyebrow">Buy. Sell. Rent.</p>
        <h1 className="hero-title-pair">
          <span>Fully automated</span>
          <span className="hero-title-sep" aria-hidden="true" />
          <span>DIY listing</span>
        </h1>
        <p className="lead">
          Browse live homes and reach owners directly — or list yours in minutes. Pay a flat fee
          online, go live automatically, and stay in control. No agent in the middle.
        </p>
        <div className="hero-actions hero-actions-center">
          <Link className="btn big" to="/browse">Browse homes</Link>
          <Link className="btn secondary" to="/list">List my home</Link>
        </div>
        <div className="hero-stats">
          <Link className="hero-stat" to="/browse?type=rent">
            <strong>Renters</strong>
            <span>Homes for rent · contact owners directly</span>
          </Link>
          <Link className="hero-stat" to="/browse?type=sale">
            <strong>Buyers</strong>
            <span>Homes for sale · contact owners directly</span>
          </Link>
          <Link className="hero-stat accent" to="/list">
            <strong>Owners</strong>
            <span>Automated list · ${LISTING_FEE_RENT_USD} rent / ${LISTING_FEE_SALE_USD} sale</span>
          </Link>
        </div>
      </section>

      <section className="split">
        <article className="path-card path-seek">
          <p className="path-kicker">Looking for a home</p>
          <h2>Buy or rent</h2>
          <p>
            Open the board, pick For rent or For sale, and message the owner by phone or email.
          </p>
          <div className="path-actions">
            <Link className="btn" to="/browse?type=rent">For rent</Link>
            <Link className="btn secondary" to="/browse?type=sale">For sale</Link>
          </div>
        </article>
        <article className="path-card path-own">
          <p className="path-kicker">Listing a home</p>
          <h2>Sell or rent out</h2>
          <p>
            Add photos and price, pay the flat fee, and your listing publishes automatically.
          </p>
          <ul className="fee-pills">
            <li><strong>${LISTING_FEE_RENT_USD}</strong> rent</li>
            <li><strong>${LISTING_FEE_SALE_USD}</strong> sale</li>
          </ul>
          <Link className="btn" to="/list">Start my listing</Link>
        </article>
      </section>

      <section className="how">
        <h2 className="section-title">How automation works</h2>
        <div className="grid how-grid three">
          <div className="card step">
            <span className="step-num">01</span>
            <h3>Enter the home</h3>
            <p className="meta">Address, price, photos, and your contact info.</p>
          </div>
          <div className="card step">
            <span className="step-num">02</span>
            <h3>Pay the flat fee</h3>
            <p className="meta">${LISTING_FEE_RENT_USD} to rent or ${LISTING_FEE_SALE_USD} to sell. No commission from us.</p>
          </div>
          <div className="card step">
            <span className="step-num">03</span>
            <h3>Go live</h3>
            <p className="meta">Listing publishes automatically. Buyers and renters reach you directly.</p>
          </div>
        </div>
      </section>

      <PartnerResources />

      <section className="realtor-band realtor-centered">
        <p className="eyebrow light">Licensed Realtor®</p>
        <h2>Want representation, not just a listing?</h2>
        <p>
          Self-serve is built for speed. When you want strategy and a licensed professional beside you,
          call Marcel Najar for a consultation.
        </p>
        <div className="hero-actions hero-actions-center">
          <a className="btn big" href="tel:2038183242">Call 203-818-3242</a>
          <a className="btn secondary" href="https://www.listingneeded.com">www.listingneeded.com</a>
        </div>
      </section>
    </div>
  )
}
