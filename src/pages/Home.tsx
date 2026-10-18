import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { prefetchLiveListings } from '../lib/store'
import HomeZipLookup from '../components/HomeZipLookup'
import PartnerResources from '../components/PartnerResources'
import QrPublicSection from '../components/QrPublicSection'
import HomeListOptions from '../components/HomeListOptions'
import { LISTING_FEE_RENT_USD, LISTING_FEE_SALE_USD } from '../lib/types'

export default function Home() {
  // v62: warm the Search feed once the homepage is idle, so clicking Search / For Rent / For Sale opens instantly
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(() => prefetchLiveListings(), { timeout: 2500 })
      return () => w.cancelIdleCallback?.(h)
    }
    const t = window.setTimeout(prefetchLiveListings, 1200)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div className="home">
      <section className="hero hero-centered">
        <Link className="eyebrow eyebrow-soft eyebrow-link" to="/cma">What’s my home worth?</Link>
        <h1 className="hero-title-v60">
          <span>Fully automated.</span> <span className="hero-title-accent">List it yourself.</span>
        </h1>
        <p className="lead hero-sub-v60">
          Post your home in minutes. No agent, no hassle.{' '}
          <strong className="hero-price-v60">${LISTING_FEE_RENT_USD} rent / ${LISTING_FEE_SALE_USD.toLocaleString()} sale.</strong>
        </p>
        <nav className="hero-pivot" aria-label="List or search">
          <Link className="hero-pivot-btn" to="/list">List</Link>
          <span className="hero-pivot-home">Home</span>
          <Link className="hero-pivot-btn" to="/browse">Search</Link>
        </nav>
      </section>

      <section className="split">
        <article className="path-card path-seek">
          <p className="path-kicker">Home search</p>
          <h2>Buy or rent</h2>
          <div className="path-actions">
            <Link className="btn" to="/browse?type=rent">For Rent</Link>
            <Link className="btn secondary" to="/browse?type=sale">For Sale</Link>
          </div>
        </article>
        <article className="path-card path-own">
          <p className="path-kicker">Listing a home</p>
          <h2>List Your Home</h2>
          <HomeListOptions />
          <ul className="fee-pills">
            <li><strong>${LISTING_FEE_RENT_USD}</strong> rent</li>
            <li><strong>${LISTING_FEE_SALE_USD}</strong> sale</li>
          </ul>
        </article>
      </section>

      <HomeZipLookup />


      <QrPublicSection />

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
