import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { canonicalTown, ctTowns } from '../lib/ctAcs'
import { fetchApprovedReviews, fmtMonthYear, personalInfoHints, submitReview, type LandlordReview } from '../lib/landlordReviews'
import { useSeo } from '../lib/seo'

/** v70: "Reporting your landlord": approved tenant experiences (filter by town) + a simple share form. */
const Stars = ({ n, label = true }: { n: number; label?: boolean }) => (
  <span className="lr-stars" aria-label={label ? `${n} out of 5 stars` : undefined}>
    {'★'.repeat(n)}
    <span className="lr-stars-off">{'★'.repeat(5 - n)}</span>
  </span>
)

export default function LandlordReviews() {
  useSeo(
    'Reporting your landlord: tenant experiences in Connecticut | Listing Needed',
    'Former tenants share what renting in their Connecticut town was like: star rating, would they rent again, and what went well or wrong.',
  )
  const [rows, setRows] = useState<LandlordReview[] | null>(null)
  const [error, setError] = useState('')
  const [sp, setSp] = useSearchParams()
  const town = sp.get('town') ?? ''
  useEffect(() => {
    fetchApprovedReviews().then(setRows).catch((e) => { setError(e instanceof Error ? e.message : 'Could not load'); setRows([]) })
  }, [])
  const towns = useMemo(() => [...new Set((rows ?? []).map((r) => r.town))].sort(), [rows])
  const shown = (rows ?? []).filter((r) => !town || r.town === town)
  const avg = shown.length ? shown.reduce((a, r) => a + r.rating, 0) / shown.length : 0
  const again = shown.filter((r) => r.would_rent_again).length

  return (
    <div className="blog lr">
      <p className="blog-crumbs"><Link to="/blog">← Blog</Link></p>
      <header className="blog-head">
        <p className="blog-kicker">Tenant experiences</p>
        <h1>Reporting your landlord</h1>
        <p className="meta">Former tenants share what renting was like in their Connecticut town: the good and the bad. Every post is read before it goes up.</p>
        <a className="btn" href="#share" onClick={(e) => { e.preventDefault(); document.getElementById('share')?.scrollIntoView({ behavior: 'smooth' }) }}>Share your experience</a>
      </header>

      <section className="lr-list" aria-labelledby="lr-list-h">
        <div className="lr-bar">
          <h2 id="lr-list-h">{town ? `Experiences in ${town}` : 'Latest experiences'}</h2>
          <label className="lr-filter">
            Town
            <select value={town} onChange={(e) => setSp(e.target.value ? { town: e.target.value } : {}, { replace: true })}>
              <option value="">All towns</option>
              {towns.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <p className="meta lr-note">New posts appear after review.</p>
        {shown.length ? (
          <p className="meta lr-summary">
            {shown.length} experience{shown.length === 1 ? '' : 's'} · average <Stars n={Math.round(avg)} /> {avg.toFixed(1)} · {again} of {shown.length} would rent again
          </p>
        ) : null}
        {error ? <p className="showing-error">{error}</p> : null}
        {rows == null ? <p className="meta">Loading…</p> : null}
        {rows && !shown.length && !error ? <p className="meta">No experiences posted{town ? ` for ${town}` : ''} yet. Be the first to share yours below.</p> : null}
        <div className="lr-grid">
          {shown.map((r) => (
            <article key={r.id} className="lr-card">
              <div className="lr-card-top">
                <strong className="lr-town">{r.town}</strong>
                <Stars n={r.rating} />
              </div>
              <p className={`lr-again ${r.would_rent_again ? 'yes' : 'no'}`}>Would rent again: {r.would_rent_again ? 'Yes' : 'No'}</p>
              <p className="lr-body">{r.body}</p>
              <p className="lr-meta">{r.display_name ? `${r.display_name} · ` : ''}Posted {fmtMonthYear(r.created_at)}</p>
            </article>
          ))}
        </div>
      </section>

      <ShareForm />
    </div>
  )
}

function ShareForm() {
  const allTowns = useMemo(() => ctTowns().map((t) => t.town), [])
  const [f, setF] = useState({ town: '', rating: 0, again: '' as '' | 'yes' | 'no', body: '', name: '', email: '', honest: false, website: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const sending = useRef(false)
  const doneRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (done) doneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [done])
  function another() {
    setF((x) => ({ ...x, rating: 0, again: '', body: '', honest: false, website: '' }))
    setError('')
    setDone(false)
  }
  const hints = personalInfoHints(`${f.body} ${f.name}`)
  const len = f.body.trim().length

  async function send(e: FormEvent) {
    e.preventDefault()
    if (sending.current) return // v70.1: no double posts
    setError('')
    const town = canonicalTown(f.town)
    if (!town) return setError('Please pick a Connecticut town from the list.')
    if (!f.rating) return setError('Please choose a star rating.')
    if (!f.again) return setError('Please answer “Would you rent again?”')
    if (len < 20 || len > 1000) return setError('Please write between 20 and 1,000 characters.')
    if (!f.honest) return setError('Please confirm this is your own honest experience as a former tenant.')
    sending.current = true
    setBusy(true)
    try {
      await submitReview({
        town, rating: f.rating, would_rent_again: f.again === 'yes', body: f.body.trim(),
        display_name: f.name.trim() || undefined, email: f.email.trim() || undefined, honest: f.honest, website: f.website,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  if (done)
    return (
      <section id="share" ref={doneRef} className="lr-success" role="status" aria-live="polite">
        <p className="lr-success-icon" aria-hidden="true">✅</p>
        <h2>Thanks! Your post was received.</h2>
        <p>It will appear here after a quick review (usually within 24 hours).</p>
        <button type="button" className="btn secondary" onClick={another}>Post another</button>
      </section>
    )

  return (
    <section id="share" className="card lr-form-card">
      <form className="body showing-form lr-form" onSubmit={send} noValidate>
        <h2>Share your experience</h2>
        <div className="lr-guidelines">
          <strong>Guidelines</strong>
          <ul>
            <li>No landlord or property-manager names, phone numbers, street addresses or other personal info.</li>
            <li>Stick to facts: what happened, repairs, deposit, communication.</li>
            <li>Posts are reviewed before they appear; we may shorten or decline them.</li>
          </ul>
        </div>
        <label>
          Town (Connecticut)
          <input list="lr-towns" value={f.town} onChange={(e) => setF({ ...f, town: e.target.value })} placeholder="Start typing, e.g. Stamford" autoComplete="off" maxLength={60} required />
          <datalist id="lr-towns">{allTowns.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <fieldset className="lr-rating">
          <legend>Your rating</legend>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={`lr-star${n <= f.rating ? ' on' : ''}`} aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-pressed={n === f.rating} onClick={() => setF({ ...f, rating: n })}>★</button>
          ))}
          <span className="meta">{f.rating ? `${f.rating} of 5` : 'Tap a star'}</span>
        </fieldset>
        <fieldset className="lr-yn">
          <legend>Would you rent again from this landlord?</legend>
          <label><input type="radio" name="again" checked={f.again === 'yes'} onChange={() => setF({ ...f, again: 'yes' })} /> Yes</label>
          <label><input type="radio" name="again" checked={f.again === 'no'} onChange={() => setF({ ...f, again: 'no' })} /> No</label>
        </fieldset>
        <label>
          What went well or wrong?
          <textarea rows={5} maxLength={1000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="e.g. Repairs were handled within a week, deposit returned in full…" required />
          <small className={`meta lr-count${len && (len < 20 || len > 1000) ? ' bad' : ''}`}>{len} / 1000 (at least 20)</small>
        </label>
        {hints.length ? <p className="lr-warn">It looks like this includes {hints.join(' and ')}. Please remove personal info. Posts with it are held for review.</p> : null}
        <div className="showing-row">
          <label>First name or initials <span className="meta">(optional)</span><input value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>Email <span className="meta">(optional, private, never shown)</span><input type="email" value={f.email} maxLength={160} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        </div>
        <input className="hp-field" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
        <label className="lr-honest">
          <input type="checkbox" checked={f.honest} onChange={(e) => setF({ ...f, honest: e.target.checked })} /> This is my own honest experience as a former tenant.
        </label>
        {error ? <div className="showing-error" role="alert">{error}</div> : null}
        <button type="submit" className="btn" disabled={busy} aria-busy={busy}>{busy ? 'Sending…' : 'Submit for review'}</button>
      </form>
    </section>
  )
}
