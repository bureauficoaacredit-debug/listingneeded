import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteAllReviews,
  deleteReview,
  fetchAllReviews,
  updateReview,
  type AdminLandlordReview,
  type ReviewEdit,
  type ReviewStatus,
} from '../lib/landlordReviews'
import { ConfirmDeleteAll, Modal } from './AdminModal'
import { US_STATES, townState } from '../lib/usStates'

const STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected']
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })

/** v70 admin: tenant experiences for "Reporting your landlord". Approve / Reject / Edit / Delete / Delete all. */
export default function LandlordReviewsPanel({ onCount }: { onCount?: (pending: number) => void }) {
  const [rows, setRows] = useState<AdminLandlordReview[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | ReviewStatus>('pending')
  const [editing, setEditing] = useState<AdminLandlordReview | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      setRows(await fetchAllReviews())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load')
      setRows([])
    }
  }
  useEffect(() => { void load() }, [])
  const pending = rows?.filter((r) => r.status === 'pending').length ?? 0
  useEffect(() => { if (rows) onCount?.(pending) }, [rows, pending, onCount])

  const replace = (u: AdminLandlordReview) => setRows((x) => x?.map((y) => (y.id === u.id ? u : y)) ?? null)
  async function setStatus(r: AdminLandlordReview, status: ReviewStatus) {
    try {
      replace(await updateReview(r.id, { status, reviewed_at: new Date().toISOString() }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }
  async function remove(r: AdminLandlordReview) {
    if (!window.confirm(`Delete this ${townState(r)} experience?`)) return
    try {
      await deleteReview(r.id)
      setRows((x) => x?.filter((y) => y.id !== r.id) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    }
  }
  async function removeAll() {
    setBusy(true)
    try {
      await deleteAllReviews()
      setRows([])
      setConfirmAll(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  const counts = { all: rows?.length ?? 0, pending: 0, approved: 0, rejected: 0 } as Record<'all' | ReviewStatus, number>
  rows?.forEach((r) => counts[r.status]++)
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === filter)

  return (
    <section className="card">
      <div className="body" style={{ display: 'grid', gap: '0.9rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>Landlord reviews</h2>
            <p className="meta" style={{ margin: 0 }}>
              From <Link to="/blog/landlord-reviews">Reporting your landlord</Link>. Only approved posts are public. Flagged = looks like it has a phone, email or street address.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn secondary" onClick={() => void load()}>Refresh</button>
            <button type="button" className="btn danger" disabled={!rows?.length} onClick={() => setConfirmAll(true)}>Delete all</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {(['pending', 'approved', 'rejected', 'all'] as const).map((k) => (
            <button key={k} type="button" className={`btn ${filter === k ? '' : 'secondary'}`} style={{ padding: '.3rem .7rem', fontSize: '.8rem' }} onClick={() => setFilter(k)}>
              {k === 'all' ? 'All' : cap(k)} ({counts[k]})
            </button>
          ))}
        </div>
        {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
        {rows == null ? <p className="meta">Loading…</p> : null}
        {rows && !shown.length ? <p className="meta">No {filter === 'all' ? '' : `${filter} `}experiences.</p> : null}
        <div style={{ display: 'grid', gap: '.6rem' }}>
          {shown.map((r) => (
            <article key={r.id} className="lr-admin-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span>
                  <strong>{townState(r)}</strong> <span className="lr-stars">{'★'.repeat(r.rating)}<span className="lr-stars-off">{'★'.repeat(5 - r.rating)}</span></span>{' '}
                  <span className={`lr-again ${r.would_rent_again ? 'yes' : 'no'}`}>Would rent again: {r.would_rent_again ? 'Yes' : 'No'}</span>
                </span>
                <span style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                  {r.flagged ? <span className="lr-flag" title={r.flag_reasons.join(', ')}>⚑ {r.flag_reasons.join(', ')}</span> : null}
                  <span className={`lr-status ${r.status}`}>{r.status}</span>
                </span>
              </div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>
              <div className="meta" style={{ fontSize: '.8rem' }}>
                {r.display_name || 'No name'} · {r.landlord_review_private?.email ? <a href={`mailto:${r.landlord_review_private.email}`}>{r.landlord_review_private.email}</a> : 'no email'} · received {fmtWhen(r.created_at)} ET
              </div>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                {r.status !== 'approved' ? <button type="button" className="btn" style={{ padding: '.3rem .8rem' }} onClick={() => void setStatus(r, 'approved')}>Approve</button> : null}
                {r.status !== 'rejected' ? <button type="button" className="btn secondary" style={{ padding: '.3rem .8rem' }} onClick={() => void setStatus(r, 'rejected')}>Reject</button> : null}
                <button type="button" className="btn secondary" style={{ padding: '.3rem .8rem' }} onClick={() => setEditing(r)}>Edit</button>
                <button type="button" className="btn danger" style={{ padding: '.3rem .8rem' }} onClick={() => void remove(r)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      {editing ? <EditReview row={editing} onClose={() => setEditing(null)} onSaved={(u) => { replace(u); setEditing(null) }} /> : null}
      {confirmAll ? (
        <ConfirmDeleteAll
          title="Delete all landlord reviews"
          message={<>This permanently deletes all {rows?.length ?? 0} landlord reviews (approved, pending and rejected).</>}
          busy={busy}
          onConfirm={removeAll}
          onCancel={() => setConfirmAll(false)}
        />
      ) : null}
    </section>
  )
}

function EditReview({ row, onClose, onSaved }: { row: AdminLandlordReview; onClose: () => void; onSaved: (r: AdminLandlordReview) => void }) {
  const [f, setF] = useState<ReviewEdit>({ state: row.state || 'CT', town: row.town, rating: row.rating, would_rent_again: row.would_rent_again, body: row.body, display_name: row.display_name, status: row.status })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    const len = (f.body ?? '').trim().length
    if (len < 20 || len > 1000) return setError('Text must be 20 to 1,000 characters.')
    setBusy(true)
    setError('')
    try {
      onSaved(await updateReview(row.id, { ...f, body: (f.body ?? '').trim(), display_name: f.display_name?.trim() || null, reviewed_at: f.status !== row.status ? new Date().toISOString() : row.reviewed_at }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Edit landlord review" onClose={onClose}>
      <form className="modal-body showing-form" onSubmit={save}>
        <div className="showing-row">
          <label>Town / city<input value={f.town ?? ''} maxLength={60} onChange={(e) => setF({ ...f, town: e.target.value })} /></label>
          <label>State
            <select value={f.state ?? 'CT'} onChange={(e) => setF({ ...f, state: e.target.value })}>
              {US_STATES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
            </select>
          </label>
        </div>
        <div className="showing-row">
          <label>Status
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ReviewStatus })}>
              {STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
            </select>
          </label>
        </div>
        <div className="showing-row">
          <label>Rating
            <select value={f.rating} onChange={(e) => setF({ ...f, rating: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
            </select>
          </label>
          <label>Would rent again
            <select value={f.would_rent_again ? 'yes' : 'no'} onChange={(e) => setF({ ...f, would_rent_again: e.target.value === 'yes' })}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        <label>Text<textarea rows={6} maxLength={1000} value={f.body ?? ''} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
        <label>First name / initials<input value={f.display_name ?? ''} maxLength={40} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
        {error ? <div className="showing-error">{error}</div> : null}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
