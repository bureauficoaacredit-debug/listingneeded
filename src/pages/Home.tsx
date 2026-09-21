import { Link } from 'react-router-dom'
import { LISTING_FEE_RENT_USD, LISTING_FEE_SALE_USD } from '../lib/types'

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Fully automated listings · Licensed Realtor® when you want one</p>
          <h1>Your next home move, without the runaround.</h1>
          <p className="lead">
            Buyers and renters browse live homes and reach owners directly. Owners list in minutes —
            pay online, go live, and get contacted. No middleman unless you ask for one.
          </p>
          <div className="hero-actions">
            <Link className="btn big" to="/browse">Browse homes</Link>
            <Link className="btn secondary" to="/list">List my home</Link>
          </div>
          <p className="hero-note">
            Rent listing ${LISTING_FEE_RENT_USD} · Sale listing ${LISTING_FEE_SALE_USD} · Fairfield County &amp; beyond
          </p>
        </div>
        <div className="hero-panel" aria-hidden="true">
          <div className="hero-stat">
            <span className="hero-stat-label">For owners</span>
            <strong>Go live the same day</strong>
            <span>Automated publish after payment</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">For seekers</span>
            <strong>Talk to the owner</strong>
            <span>No agent gatekeeping your inquiry</span>
          </div>
          <div className="hero-stat accent">
            <span className="hero-stat-label">Prefer a pro?</span>
            <strong>Licensed Realtor®</strong>
            <span>Marcel Najar · call for a consult</span>
          </div>
        </div>
      </section>

      <section className="split">
        <article className="path-card path-seek">
          <p className="path-kicker">Looking?</p>
          <h2>Buy or rent with a clear path.</h2>
          <p>
            Open the browse board, filter by what you need, and contact the owner by phone or email.
            Simple, direct, and built for people who want answers today.
          </p>
          <Link className="btn" to="/browse">Find a home</Link>
        </article>
        <article className="path-card path-own">
          <p className="path-kicker">Owning?</p>
          <h2>List once. Stay in control.</h2>
          <p>
            Upload photos, set your price, pay the flat fee, and your listing goes live automatically.
            Interested people reach you — you decide who to talk to.
          </p>
          <ul className="fee-pills">
            <li><strong>${LISTING_FEE_RENT_USD}</strong> rent</li>
            <li><strong>${LISTING_FEE_SALE_USD}</strong> sale</li>
          </ul>
          <Link className="btn" to="/list">Start my listing</Link>
        </article>
      </section>

      <section className="how">
        <h2>How the automation works</h2>
        <div className="grid how-grid">
          <div className="card step">
            <span className="step-num">01</span>
            <h3>Tell us about the home</h3>
            <p className="meta">Address, price, photos, and how you want to be reached.</p>
          </div>
          <div className="card step">
            <span className="step-num">02</span>
            <h3>Pay the flat fee</h3>
            <p className="meta">${LISTING_FEE_RENT_USD} to rent or ${LISTING_FEE_SALE_USD} to sell. No commission from us.</p>
          </div>
          <div className="card step">
            <span className="step-num">03</span>
            <h3>Live &amp; get contacted</h3>
            <p className="meta">Your listing publishes automatically. Buyers and renters message you directly.</p>
          </div>
        </div>
      </section>

      <section className="realtor-band">
        <div>
          <p className="eyebrow light">Licensed Realtor® · Marcel Najar</p>
          <h2>Want representation, not just a listing?</h2>
          <p>
            Self-serve is built for speed. When you want strategy, negotiation, and a licensed
            professional beside you, call for a consultation — we’ll pick the path that fits your property.
          </p>
          <div className="hero-actions">
            <a className="btn big" href="tel:2038183242">Call 203-818-3242</a>
            <a className="btn secondary" href="https://www.listingneeded.com">www.listingneeded.com</a>
          </div>
        </div>
      </section>
    </div>
  )
}
