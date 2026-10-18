import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BlogCta from '../components/BlogCta'
import ShareLinkButton from '../components/ShareLinkButton'
import { fetchPostBySlug, fmtPostDate, readingMinutes, type BlogPost as Post } from '../lib/blog'
import { markdownToText, renderMarkdown } from '../lib/markdown'
import { useSeo } from '../lib/seo'

/** v64: one blog article. */
export default function BlogPost() {
  const { slug = '' } = useParams()
  const [post, setPost] = useState<Post | null | undefined>(undefined)
  const [error, setError] = useState('')
  useEffect(() => {
    setPost(undefined)
    setError('')
    fetchPostBySlug(slug).then(setPost).catch((e) => setError(e instanceof Error ? e.message : 'Could not load this article'))
    window.scrollTo(0, 0)
  }, [slug])
  const html = useMemo(() => (post ? renderMarkdown(post.body) : ''), [post])
  useSeo(post ? `${post.title} | Listing Needed` : null, post ? post.excerpt || markdownToText(post.body).slice(0, 160) : null)

  if (error) return <div className="card"><div className="body" style={{ color: '#b91c1c' }}>{error}</div></div>
  if (post === undefined) {
    return (
      <article className="blog-article" aria-busy="true">
        <div className="skel skel-line w40" /><div className="skel skel-line w90" style={{ height: '2rem' }} /><div className="skel skel-line w60" />
      </article>
    )
  }
  if (!post) {
    return (
      <div className="card"><div className="body">
        <h2 style={{ marginTop: 0 }}>Article not found</h2>
        <p className="meta">It may have been moved or unpublished.</p>
        <Link className="btn" to="/blog">All articles</Link>
      </div></div>
    )
  }
  const url = `https://www.listingneeded.com/#/blog/${post.slug}`
  return (
    <article className="blog-article">
      <nav className="blog-crumbs" aria-label="Breadcrumb"><Link to="/blog">← All articles</Link></nav>
      {!post.published ? <div className="danger-note" style={{ marginBottom: '1rem' }}>Draft: only you (admin) can see this.</div> : null}
      <header className="blog-article-head">
        {post.category ? <span className="badge">{post.category}</span> : null}
        <h1>{post.title}</h1>
        {post.excerpt ? <p className="blog-lede">{post.excerpt}</p> : null}
        <div className="blog-byline">
          <span>By <strong>{post.author || 'Marcel Najar'}</strong> · {fmtPostDate(post.published_at || post.created_at)} · {readingMinutes(post.body)} min read</span>
          <ShareLinkButton title={post.title} text={post.excerpt || post.title} url={url} />
        </div>
      </header>
      {post.cover_image_url ? <img className="blog-cover" src={post.cover_image_url} alt="" /> : null}
      <div className="blog-prose" dangerouslySetInnerHTML={{ __html: html }} />
      <BlogCta />
    </article>
  )
}
