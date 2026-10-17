import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteAllShowingRequests,
  deleteShowingRequest,
  fetchShowingRequests,
  updateShowingRequest,
  type ShowingEdit,
  type ShowingRequest,
  type ShowingStatus,
} from '../lib/showings'
import { ConfirmDeleteAll, Modal } from './AdminModal'

const STATUSES: ShowingStatus[] = ['new', 'confirmed', 'done']
// Marcel's ShowingTime (agent) account. ShowingTime documents no public deep link by MLS number, so the admin
// opens ShowingTime and pastes the copied MLS # into its search.
const SHOWINGTIME_URL = 'https://agent.showingtime.com/listings'

function MlsShowingTime({ mls }: { mls: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(mls)
    } catch {
      const t = document.createElement('textarea')
      t.value = mls
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2200)
  }
  return (
    <div className="showing-st-row">
      <a className="btn secondary showing-st-btn" href={SHOWINGTIME_URL} target="_blank" rel="noopener noreferrer">
        Open in ShowingTime ↗
      </a>
      <span className="showing-mls">
        MLS # {mls}
        <button type="button" className="showing-copy" onClick={copy} aria-label={`Copy MLS number ${mls}`}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </span>
      {copied ? <span className="showing-toast" role="status">MLS # copied — paste it in ShowingTime search</span> : null}
    </div>
  )
}
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })
const fmtDay = (ymd: string | null) =>
  ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''

/** v54 admin: showing requests, newest first, with status, Edit, Delete, Delete all. */
export default function ShowingRequestsPanel() {
  const [rows, setRows] = useState<ShowingRequest[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<ShowingRequest | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'all' | ShowingStatus>('all')

  async function load() {
    setError('')
    try {
      setRows(await fetchShowingRequests())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load')
      setRows([])
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function setStatus(r: ShowingRequest, status: ShowingStatus) {
    try {
      const u = await updateShowingRequest(r.id, { status })
      setRows((x) => x?.map((y) => (y.id === r.id ? u : y)) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  async function remove(r: ShowingRequest) {
    if (!window.confirm(`Delete the showing request from ${r.name}?`)) return
    try {
      await deleteShowingRequest(r.id)
      setRows((x) => x?.filter((y) => y.id !== r.id) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  async function removeAll() {
    setBusy(true)
    try {
      await deleteAllShowingRequests()
      setRows([])
      setConfirmAll(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  const counts = { all: rows?.length ?? 0, new: 0, confirmed: 0, done: 0 } as Record<'all' | ShowingStatus, number>
  rows?.forEach((r) => counts[r.status]++)
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === filter)

  return (
    <section className="card">
      <div className="body" style={{ display: 'grid', gap: '0.9rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>Showing requests</h2>
            <p className="meta" style={{ margin: 0 }}>From “Schedule a showing” on every home page. Newest first.</p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn secondary" onClick={() => void load()}>Refresh</button>
            <button type="button" className="btn danger" disabled={!rows?.length} onClick={() => setConfirmAll(true)}>
              Delete all
            </button>
          </div>
        </div>
        <div className="admin-chips" style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {(['all', ...STATUSES] as const).map((k) => (
            <button key={k} type="button" className={`btn ${filter === k ? '' : 'secondary'}`} style={{ padding: '.3rem .7rem', fontSize: '.8rem' }} onClick={() => setFilter(k)}>
              {k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1)} ({counts[k]})
            </button>
          ))}
        </div>
        {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
        {rows == null ? <p className="meta">Loading…</p> : null}
        {rows && !shown.length ? <p className="meta">No showing requests{filter === 'all' ? ' yet' : ` marked ${filter}`}.</p> : null}
        <div className="showing-list" style={{ display: 'grid', gap: '.6rem' }}>
          {shown.map((r) => (
            <article key={r.id} className="showing-item" style={{ border: '1px solid var(--line)', padding: '.75rem .9rem', display: 'grid', gap: '.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <Link to={`/listing/${r.listing_id}`} style={{ fontWeight: 700 }}>{r.address || r.listing_id}</Link>
                <span className={`showing-status ${r.status}`}>{r.status}</span>
              </div>
              <div style={{ fontSize: '.92rem' }}>
                <strong>{fmtDay(r.preferred_date)} · {r.preferred_time}</strong>
                {r.alt_date ? <span className="meta"> · 2nd: {fmtDay(r.alt_date)}{r.alt_time ? ` · ${r.alt_time}` : ''}</span> : null}
              </div>
              <div style={{ fontSize: '.92rem' }}>
                {r.name} · <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a>
                {r.email ? <> · <a href={`mailto:${r.email}`}>{r.email}</a></> : null}
              </div>
              {r.message ? <div className="meta" style={{ whiteSpace: 'pre-wrap' }}>“{r.message}”</div> : null}
              {r.admin_notes ? <div className="meta">Notes: {r.admin_notes}</div> : null}
              <div className="meta" style={{ fontSize: '.78rem' }}>
                Received {fmtWhen(r.created_at)} ET{r.mls_number ? ` · MLS #${r.mls_number}` : ' · DIY listing'}
              </div>
              {r.mls_number ? <MlsShowingTime mls={r.mls_number} /> : null}
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={r.status} onChange={(e) => void setStatus(r, e.target.value as ShowingStatus)} style={{ width: 'auto', padding: '.3rem .5rem' }} aria-label="Status">
                  {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </select>
                <button type="button" className="btn secondary" style={{ padding: '.3rem .8rem' }} onClick={() => setEditing(r)}>Edit</button>
                <button type="button" className="btn danger" style={{ padding: '.3rem .8rem' }} onClick={() => void remove(r)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      {editing ? (
        <EditShowing
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            setRows((x) => x?.map((y) => (y.id === u.id ? u : y)) ?? null)
            setEditing(null)
          }}
        />
      ) : null}
      {confirmAll ? (
        <ConfirmDeleteAll
          title="Delete all showing requests"
          message={<>This permanently deletes all {rows?.length ?? 0} showing requests.</>}
          busy={busy}
          onConfirm={removeAll}
          onCancel={() => setConfirmAll(false)}
        />
      ) : null}
    </section>
  )
}

function EditShowing({ row, onClose, onSaved }: { row: ShowingRequest; onClose: () => void; onSaved: (r: ShowingRequest) => void }) {
  const [f, setF] = useState<ShowingEdit>({
    status: row.status,
    preferred_date: row.preferred_date,
    preferred_time: row.preferred_time,
    alt_date: row.alt_date,
    alt_time: row.alt_time,
    name: row.name,
    phone: row.phone,
    email: row.email,
    message: row.message,
    admin_notes: row.admin_notes,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof ShowingEdit) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value || null }))

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onSaved(await updateShowingRequest(row.id, { ...f, status: f.status || 'new', preferred_date: f.preferred_date || row.preferred_date }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit showing request" onClose={onClose}>
      <form className="modal-body showing-form" onSubmit={save}>
        <p className="meta" style={{ margin: 0 }}>{row.address}</p>
        <label>
          Status
          <select value={f.status ?? 'new'} onChange={set('status')}>
            {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
        <div className="showing-row">
          <label>Preferred date<input type="date" value={f.preferred_date ?? ''} onChange={set('preferred_date')} /></label>
          <label>Time<input value={f.preferred_time ?? ''} onChange={set('preferred_time')} /></label>
        </div>
        <div className="showing-row">
          <label>2nd choice date<input type="date" value={f.alt_date ?? ''} onChange={set('alt_date')} /></label>
          <label>Time<input value={f.alt_time ?? ''} onChange={set('alt_time')} /></label>
        </div>
        <label>Name<input value={f.name ?? ''} onChange={set('name')} /></label>
        <div className="showing-row">
          <label>Phone<input value={f.phone ?? ''} onChange={set('phone')} /></label>
          <label>Email<input value={f.email ?? ''} onChange={set('email')} /></label>
        </div>
        <label>Message<textarea rows={3} value={f.message ?? ''} onChange={set('message')} /></label>
        <label>Admin notes<textarea rows={2} value={f.admin_notes ?? ''} onChange={set('admin_notes')} /></label>
        {error ? <div className="showing-error">{error}</div> : null}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
