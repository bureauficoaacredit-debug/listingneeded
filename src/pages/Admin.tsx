import { useEffect, useState, type FormEvent } from 'react'
import type { Listing } from '../lib/types'
import { allListings, deleteListing } from '../lib/store'

/**
 * Lightweight test admin. VITE_ADMIN_PASSWORD is baked into the client bundle
 * (Vite env) — fine for early private use. Real admin should move to
 * server-side auth later (e.g. with Stripe webhooks / service role).
 */
const SESSION_KEY = 'listingneeded_admin_ok'

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

export default function Admin() {
  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined
  const [unlocked, setUnlockedState] = useState(false)
  const [password, setPassword] = useState('')
  const [gateError, setGateError] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    setUnlockedState(isUnlocked())
  }, [])

  useEffect(() => {
    if (!unlocked) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const rows = await allListings()
        if (!cancelled) setListings(rows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load listings')
      } finally {
        if (!cancelled) setLoading(false)
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
          : `Hard delete blocked (RLS / 0 rows) — soft-deleted listing ${id} (live=false, paid=false). It will no longer appear on Browse.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
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
            Set <code>VITE_ADMIN_PASSWORD</code> in the environment (local <code>.env</code> or Vercel),
            then rebuild/redeploy.
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
            {gateError ? (
              <div style={{ color: '#b91c1c', fontSize: '0.92rem' }}>{gateError}</div>
            ) : null}
            <button type="submit" className="btn">
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ margin: '0 0 .35rem' }}>Admin · all listings</h1>
          <p className="meta" style={{ margin: 0 }}>
            Test tool — password is client-side. Move to server auth later.
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
    </div>
  )
}
