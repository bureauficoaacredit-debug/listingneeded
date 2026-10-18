import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  createPost,
  deleteAllPosts,
  deletePost,
  fetchAllPosts,
  fmtPostDate,
  slugify,
  updatePost,
  type BlogInput,
  type BlogPost,
} from '../lib/blog'
import { renderMarkdown } from '../lib/markdown'
import { ConfirmDeleteAll, Modal } from './AdminModal'

const EMPTY: BlogInput = { title: '', slug: '', excerpt: '', body: '', cover_image_url: '', category: '', published: false }

function PostEditor({ post, onClose, onSaved }: { post: BlogPost | null; onClose: () => void; onSaved: (p: BlogPost) => void }) {
  const [f, setF] = useState<BlogInput>(() =>
    post
      ? { title: post.title, slug: post.slug, excerpt: post.excerpt, body: post.body, cover_image_url: post.cover_image_url ?? '', category: post.category, published: post.published }
      : EMPTY,
  )
  const [slugTouched, setSlugTouched] = useState(!!post)
  const [view, setView] = useState<'write' | 'preview'>('write')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof BlogInput>(k: K, v: BlogInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const preview = useMemo(() => (view === 'preview' ? renderMarkdown(f.body) : ''), [view, f.body])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const slug = slugify(f.slug || f.title)
    if (f.title.trim().length < 3) return setError('Add a title.')
    if (!slug) return setError('Add a web address (slug).')
    setBusy(true)
    try {
      const data = { ...f, title: f.title.trim(), slug, excerpt: f.excerpt.trim() }
      onSaved(post ? await updatePost(post.id, data) : await createPost(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={post ? 'Edit article' : 'Add article'} onClose={onClose} wide>
      <form className="modal-body blog-editor" onSubmit={submit}>
        <label>Title
          <input value={f.title} onChange={(e) => { set('title', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)) }} required maxLength={200} />
        </label>
        <div className="row">
          <label>Web address (slug)
            <input value={f.slug} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value) }} placeholder="my-article" maxLength={120} />
            <span className="note">listingneeded.com/#/blog/{slugify(f.slug || f.title) || '…'}</span>
          </label>
          <label>Category
            <input value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Renting, Selling, Market insights…" maxLength={60} />
          </label>
        </div>
        <label>Short summary (shown on the blog list and in Google)
          <textarea rows={2} value={f.excerpt} onChange={(e) => set('excerpt', e.target.value)} maxLength={400} />
        </label>
        <label>Cover image URL (optional)
          <input value={f.cover_image_url ?? ''} onChange={(e) => set('cover_image_url', e.target.value)} placeholder="https://…" />
        </label>
        <div className="blog-editor-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'write'} className={`admin-tab${view === 'write' ? ' active' : ''}`} onClick={() => setView('write')}>Write (Markdown)</button>
          <button type="button" role="tab" aria-selected={view === 'preview'} className={`admin-tab${view === 'preview' ? ' active' : ''}`} onClick={() => setView('preview')}>Preview</button>
        </div>
        {view === 'write' ? (
          <label className="blog-editor-body">
            <span className="note">## Heading · **bold** · *italic* · - list · 1. list · [link](https://…) · &gt; quote</span>
            <textarea rows={16} value={f.body} onChange={(e) => set('body', e.target.value)} spellCheck />
          </label>
        ) : (
          <div className="blog-prose blog-preview" dangerouslySetInnerHTML={{ __html: preview || '<p class="meta">Nothing to preview yet.</p>' }} />
        )}
        <label className="blog-publish-toggle">
          <input type="checkbox" checked={f.published} onChange={(e) => set('published', e.target.checked)} /> Published (visible on the public blog)
        </label>
        {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** v64 Admin > Blog: list, Add, Edit (Markdown + preview), Publish toggle, Delete, Delete all (type DELETE). */
export default function BlogAdminPanel() {
  const [rows, setRows] = useState<BlogPost[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<BlogPost | 'new' | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      setRows(await fetchAllPosts())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load posts')
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function togglePublish(p: BlogPost) {
    try {
      const u = await updatePost(p.id, { published: !p.published })
      setRows((x) => x?.map((y) => (y.id === u.id ? u : y)) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update')
    }
  }
  async function remove(p: BlogPost) {
    if (!window.confirm(`Delete “${p.title}”? This can’t be undone.`)) return
    try {
      await deletePost(p.id)
      setRows((x) => x?.filter((y) => y.id !== p.id) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    }
  }
  async function removeAll() {
    setBusy(true)
    try {
      await deleteAllPosts()
      setRows([])
      setConfirmAll(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  const published = rows?.filter((r) => r.published).length ?? 0
  return (
    <section className="card">
      <div className="body" style={{ display: 'grid', gap: '0.9rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>Blog</h2>
            <p className="meta" style={{ margin: 0 }}>
              {rows ? `${rows.length} article${rows.length === 1 ? '' : 's'} · ${published} published` : 'Articles on '}
              {rows ? ' · ' : ''}<Link to="/blog">View the blog ↗</Link>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => setEditing('new')}>Add article</button>
            <button type="button" className="btn danger" disabled={!rows?.length} onClick={() => setConfirmAll(true)}>Delete all</button>
          </div>
        </div>
        {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
        {rows == null ? <p className="meta">Loading…</p> : null}
        {rows && !rows.length ? <p className="meta">No articles yet. Click “Add article”.</p> : null}
        <div style={{ display: 'grid', gap: '.6rem' }}>
          {rows?.map((p) => (
            <article key={p.id} className="blog-admin-item">
              <div className="blog-admin-main">
                <Link to={`/blog/${p.slug}`} style={{ fontWeight: 700 }}>{p.title}</Link>
                <div className="meta" style={{ fontSize: '.82rem' }}>
                  {p.category ? `${p.category} · ` : ''}
                  {p.published ? `Published ${fmtPostDate(p.published_at)}` : 'Draft'} · /blog/{p.slug}
                </div>
              </div>
              <div className="blog-admin-actions">
                <label className="blog-switch" title="Publish on the public blog">
                  <input type="checkbox" checked={p.published} onChange={() => void togglePublish(p)} />
                  <span>{p.published ? 'Published' : 'Draft'}</span>
                </label>
                <button type="button" className="btn secondary" style={{ padding: '.3rem .8rem' }} onClick={() => setEditing(p)}>Edit</button>
                <button type="button" className="btn danger" style={{ padding: '.3rem .8rem' }} onClick={() => void remove(p)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      {editing ? (
        <PostEditor
          post={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            setRows((x) => (x?.some((y) => y.id === u.id) ? x.map((y) => (y.id === u.id ? u : y)) : [u, ...(x ?? [])]))
            setEditing(null)
          }}
        />
      ) : null}
      {confirmAll ? (
        <ConfirmDeleteAll
          title="Delete all articles"
          message={<>This permanently deletes all {rows?.length ?? 0} blog articles, published and drafts.</>}
          busy={busy}
          onConfirm={removeAll}
          onCancel={() => setConfirmAll(false)}
        />
      ) : null}
    </section>
  )
}
