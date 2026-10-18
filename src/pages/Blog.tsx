import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublishedPosts, fmtPostDate, type BlogCard } from '../lib/blog'
import { useSeo } from '../lib/seo'

/** v64: public blog list, newest first. */
export default function Blog() {
  const [posts, setPosts] = useState<BlogCard[] | null>(null)
  const [error, setError] = useState('')
  useSeo('Blog: renting, buying & selling in Connecticut | Listing Needed', 'Practical guides and rental market highlights for Connecticut renters, buyers and do-it-yourself sellers, from Marcel Najar at Listing Needed.')
  useEffect(() => {
    fetchPublishedPosts().then(setPosts).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the blog'))
  }, [])
  return (
    <div className="blog">
      <header className="blog-head">
        <p className="blog-kicker">Listing Needed blog</p>
        <h1>Renting, buying &amp; selling in Connecticut</h1>
        <p className="meta">Rental market highlights and practical tips for CT renters, buyers and DIY sellers.</p>
      </header>
      <Link to="/blog/landlord-reviews" className="lr-promo">
        <span className="lr-promo-icon" aria-hidden="true">★</span>
        <span>
          <span className="blog-kicker">Tenant experiences</span>
          <strong>Reporting your landlord</strong>
          <span className="meta">Read what former tenants say about renting in their town, anywhere in the US, or share your own: star rating, would you rent again, what went well or wrong.</span>
        </span>
        <span className="blog-card-more">Read &amp; share →</span>
      </Link>
      {error ? <div className="card"><div className="body" style={{ color: '#b91c1c' }}>{error}</div></div> : null}
      {posts == null && !error ? (
        <div className="blog-grid" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="blog-card skel-card"><div className="body"><div className="skel skel-line w40" /><div className="skel skel-line w90" /><div className="skel skel-line w60" /></div></div>
          ))}
        </div>
      ) : null}
      {posts && !posts.length ? <p className="meta">No articles yet. Check back soon.</p> : null}
      {posts?.length ? (
        <div className="blog-grid">
          {posts.map((p) => (
            <Link key={p.id} to={`/blog/${p.slug}`} className="blog-card">
              {p.cover_image_url ? <img className="blog-card-img" src={p.cover_image_url} alt="" loading="lazy" decoding="async" /> : <div className="blog-card-band" aria-hidden="true" />}
              <div className="blog-card-body">
                <p className="blog-card-meta">
                  {p.category ? <span className="badge">{p.category}</span> : null}
                  <span>{fmtPostDate(p.published_at)}</span>
                </p>
                <h2>{p.title}</h2>
                <p className="blog-card-excerpt">{p.excerpt}</p>
                <span className="blog-card-more">Read article →</span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
