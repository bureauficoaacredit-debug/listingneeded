import { useEffect, useState, type FormEvent } from 'react'
import type { Listing, PartnerCategory, PartnerLink } from '../lib/types'
import { PARTNER_CATEGORY_LABELS } from '../lib/types'
import {
  allListings,
  allPartnerLinks,
  deleteListing,
  deletePartnerLink,
  insertPartnerLink,
  updatePartnerLink,
} from '../lib/store'

const SESSION_KEY = 'listingneeded_admin_ok'
const CATEGORIES = Object.keys(PARTNER_CATEGORY_LABELS) as PartnerCategory[]

function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function setUnlocked(value: boolean) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, '1')
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

function formatPrice(l: Listing): string {
  const n = l.price.toLocaleString()
  return l.type === 'rent' ? `$${n}/mo` : `$${n}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

type LinkForm = {
  title: string
  url: string
  category: PartnerCategory
  blurb: string
  sortOrder: string
  enabled: boolean
}

const emptyForm = (): LinkForm => ({
  title: '',
  url: 'https://',
  category: 'mortgage',
  blurb: '',
  sortOrder: '0',
  enabled: true,
})

export default function Admin() {
  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined
  const [unlocked, setUnlockedState] = useState(false)
  const [password, setPassword] = useState('')
  const [gateError, setGateError] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [links, setLinks] = useState<PartnerLink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [partnerSetupError, setPartnerSetupError] = useState('')
  const [status, setStatus] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [form, setForm] = useState<LinkForm>(emptyForm())
  const [savingLink, setSavingLink] = useState(false)

  useEffect(() => {
    setUnlockedState(isUnlocked())
  }, [])

  useEffect(() => {
    if (!unlocked) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      setPartnerSetupError('')
      try {
        const rows = await allListings()
        if (!cancelled) setListings(rows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load listings')
      } finally {
        if (!cancelled) setLoading(false)
      }
      try {
        const partnerRows = await allPartnerLinks()
        if (!cancelled) setLinks(partnerRows)
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load partner links'
          if (msg.includes('partner_links') || msg.includes('PGRST205')) {
            setPartnerSetupError(
              'Partner links table is missing. Run the partner_links SQL in Supabase (listingneeded project), then refresh.',
            )
          } else {
            setPartnerSetupError(msg)
          }
          setLinks([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [unlocked])

  function handleUnlock(e: FormEvent) {
    e.preventDefault()
    setGateError('')
    if (!adminPassword) {
      setGateError('Set VITE_ADMIN_PASSWORD in the environment, then rebuild/redeploy.')
      return
    }
    if (password !== adminPassword) {
      setGateError('Wrong password.')
      return
    }
    setUnlocked(true)
    setUnlockedState(true)
    setPassword('')
  }

  function handleLock() {
    setUnlocked(false)
    setUnlockedState(false)
    setListings([])
    setLinks([])
    setStatus('')
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this listing? Will try hard delete, then soft-delete (live/paid false).')) {
      return
    }
    setBusyId(id)
    setStatus('')
    setError('')
    try {
      const mode = await deleteListing(id)
      setListings((prev) => prev.filter((l) => l.id !== id))
      setStatus(
        mode === 'hard'
          ? `Hard-deleted listing ${id}.`
          : `Soft-deleted listing ${id} (live=false, paid=false).`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleAddLink(e: FormEvent) {
    e.preventDefault()
    setSavingLink(true)
    setError('')
    setStatus('')
    try {
      const created = await insertPartnerLink({
        title: form.title,
        url: form.url,
        category: form.category,
        blurb: form.blurb,
        sortOrder: Number(form.sortOrder) || 0,
        enabled: form.enabled,
      })
      setLinks((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder))
      setForm(emptyForm())
      setPartnerSetupError('')
      setStatus(`Added partner link: ${created.title}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add link')
    } finally {
      setSavingLink(false)
    }
  }

  async function toggleLink(link: PartnerLink) {
    setBusyId(link.id)
    setError('')
    try {
      const updated = await updatePartnerLink(link.id, { enabled: !link.enabled })
      setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)))
      setStatus(`${updated.title} is now ${updated.enabled ? 'visible' : 'hidden'} on the site.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  async function removeLink(link: PartnerLink) {
    if (!confirm(`Remove “${link.title}”?`)) return
    setBusyId(link.id)
    setError('')
    try {
      await deletePartnerLink(link.id)
      setLinks((prev) => prev.filter((l) => l.id !== link.id))
      setStatus(`Removed ${link.title}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setBusyId(null)
    }
  }

  if (!adminPassword) {
    return (
      <div className="card">
        <div className="body">
          <h1 style={{ margin: '0 0 .5rem' }}>Admin</h1>
          <p className="meta" style={{ margin: 0 }}>
            Set <code>VITE_ADMIN_PASSWORD</code> in the environment, then rebuild/redeploy.
          </p>
        </div>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div className="card" style={{ maxWidth: 420 }}>
        <div className="body">
          <h1 style={{ margin: '0 0 .35rem' }}>Admin</h1>
          <p className="meta">Password unlocks this tab for the session.</p>
          <form className="form" style={{ boxShadow: 'none', border: 'none', padding: 0 }} onSubmit={handleUnlock}>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {gateError ? <div style={{ color: '#b91c1c', fontSize: '0.92rem' }}>{gateError}</div> : null}
            <button type="submit" className="btn">
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ margin: '0 0 .35rem' }}>Admin</h1>
          <p className="meta" style={{ margin: 0 }}>
            Manage listings and partner links (mortgage, screening, and more).
          </p>
        </div>
        <button type="button" className="btn secondary" onClick={handleLock}>
          Lock
        </button>
      </div>

      {status ? <div className="success">{status}</div> : null}
      {error ? (
        <div className="card">
          <div className="body" style={{ color: '#b91c1c' }}>
            {error}
          </div>
        </div>
      ) : null}

      <section className="card">
        <div className="body" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>Partner links</h2>
            <p className="meta" style={{ margin: 0 }}>
              Same login as listings. Enabled links show under “Helpful connections” on the homepage.
            </p>
          </div>

          {partnerSetupError ? (
            <div style={{ background: '#fff8e8', border: '1px solid #ffeeba', padding: '0.9rem 1rem', color: '#856404' }}>
              <strong>Setup needed:</strong> {partnerSetupError}
              <div className="meta" style={{ marginTop: '0.5rem' }}>
                Supabase → listingneeded project → SQL Editor → run the create table script, then refresh this page.
                Listings below still work with this same admin unlock.
              </div>
            </div>
          ) : null}

          <form className="form" style={{ boxShadow: 'none', border: '1px solid var(--line)', opacity: partnerSetupError ? 0.55 : 1 }} onSubmit={handleAddLink}>
            <div className="row">
              <label>
                Title
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Preferred mortgage broker"
                />
              </label>
              <label>
                Category
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as PartnerCategory }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {PARTNER_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              URL
              <input
                required
                type="url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://"
              />
            </label>
            <label>
              Short blurb (optional)
              <input
                value={form.blurb}
                onChange={(e) => setForm((f) => ({ ...f, blurb: e.target.value }))}
                placeholder="Pre-approval help for buyers"
              />
            </label>
            <div className="row">
              <label>
                Sort order
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </label>
              <label style={{ alignContent: 'end' }}>
                <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                  />
                  Show on site
                </span>
              </label>
            </div>
            <button type="submit" className="btn" disabled={savingLink || !!partnerSetupError}>
              {savingLink ? 'Saving…' : 'Add partner link'}
            </button>
          </form>

          {loading ? (
            <p className="meta">Loading links…</p>
          ) : links.length === 0 ? (
            <p className="meta">No partner links yet. Add a mortgage or screening URL above.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>URL</th>
                    <th>Order</th>
                    <th>Visible</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link.id}>
                      <td>
                        <strong>{link.title}</strong>
                        {link.blurb ? <div className="meta">{link.blurb}</div> : null}
                      </td>
                      <td>
                        <span className="badge">{PARTNER_CATEGORY_LABELS[link.category]}</span>
                      </td>
                      <td style={{ wordBreak: 'break-all', maxWidth: 220 }}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.url}
                        </a>
                      </td>
                      <td>{link.sortOrder}</td>
                      <td>{link.enabled ? 'yes' : 'no'}</td>
                      <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                          disabled={busyId === link.id}
                          onClick={() => toggleLink(link)}
                        >
                          {link.enabled ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          disabled={busyId === link.id}
                          onClick={() => removeLink(link)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ margin: '0 0 .75rem' }}>All listings</h2>
        {loading ? (
          <div className="card">
            <div className="body">Loading listings…</div>
          </div>
        ) : listings.length === 0 ? (
          <div className="card">
            <div className="body">No listings in the database.</div>
          </div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Live / Paid</th>
                  <th>Owner email</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.address}</strong>
                      <div className="meta">
                        {l.city}, {l.state} {l.zip}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${l.type}`}>{l.type}</span>
                    </td>
                    <td>{formatPrice(l)}</td>
                    <td>
                      {l.live ? 'live' : 'off'} / {l.paid ? 'paid' : 'unpaid'}
                    </td>
                    <td style={{ wordBreak: 'break-all' }}>{l.ownerEmail}</td>
                    <td className="meta">{formatDate(l.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn danger"
                        disabled={busyId === l.id}
                        onClick={() => handleDelete(l.id)}
                      >
                        {busyId === l.id ? '…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
