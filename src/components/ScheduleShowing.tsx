import { useState, type FormEvent } from 'react'
import type { Listing } from '../lib/types'
import { requestShowing } from '../lib/showings'
import { Modal } from './AdminModal'

const SHOWINGTIME_URL = 'https://www.showingtime.com/'
const TIMES = [
  'Morning (9–12)',
  'Afternoon (12–4)',
  'Evening (4–7)',
  ...Array.from({ length: 23 }, (_, i) => {
    const mins = 9 * 60 + i * 30 // 9:00 AM … 8:00 PM
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${((h + 11) % 12) + 1}:${m ? '30' : '00'} ${h < 12 ? 'AM' : 'PM'}`
  }),
]

function todayEt() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

/** v54: "Schedule a showing" button + form on every home page (MLS + DIY). Saves to showing_requests via RPC. */
export default function ScheduleShowing({ listing }: { listing: Listing }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [showAlt, setShowAlt] = useState(false)
  const [f, setF] = useState({ date: '', time: '', altDate: '', altTime: '', name: '', phone: '', email: '', message: '', website: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const min = todayEt()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.date || !f.time) return setError('Pick a preferred date and time.')
    if (f.name.trim().length < 2) return setError('Please enter your name.')
    if (f.phone.replace(/\D/g, '').length < 10) return setError('Please enter a phone number we can call or text.')
    setBusy(true)
    try {
      await requestShowing({
        listing_id: listing.id,
        preferred_date: f.date,
        preferred_time: f.time,
        alt_date: showAlt ? f.altDate : '',
        alt_time: showAlt ? f.altTime : '',
        name: f.name,
        phone: f.phone,
        email: f.email,
        message: f.message,
        website: f.website,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="btn big showing-btn" onClick={() => setOpen(true)}>
        Schedule a showing
      </button>
      {open ? (
        <Modal title="Schedule a showing" onClose={() => setOpen(false)}>
          {done ? (
            <div className="modal-body">
              <div className="success">
                Request sent for <strong>{listing.address}</strong>. We’ll call or text you to confirm the time.
              </div>
              <p className="showing-contact">
                Questions? Call or text <a href="tel:2038183242">203-818-3242</a>
              </p>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setOpen(false)}>Done</button>
              </div>
            </div>
          ) : (
            <form className="modal-body showing-form" onSubmit={submit} noValidate>
              <p className="meta" style={{ margin: 0 }}>{[listing.address, listing.city].filter(Boolean).join(', ')}</p>
              <div className="showing-row">
                <label>
                  Preferred date
                  <input type="date" min={min} value={f.date} onChange={set('date')} required />
                </label>
                <label>
                  Time
                  <select value={f.time} onChange={set('time')} required>
                    <option value="">Choose…</option>
                    {TIMES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
              </div>
              {showAlt ? (
                <div className="showing-row">
                  <label>
                    2nd choice date <span className="meta">(optional)</span>
                    <input type="date" min={min} value={f.altDate} onChange={set('altDate')} />
                  </label>
                  <label>
                    Time
                    <select value={f.altTime} onChange={set('altTime')}>
                      <option value="">Choose…</option>
                      {TIMES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </label>
                </div>
              ) : (
                <button type="button" className="link-btn showing-alt" onClick={() => setShowAlt(true)}>+ Add a 2nd choice</button>
              )}
              <label>
                Name
                <input autoComplete="name" value={f.name} onChange={set('name')} required />
              </label>
              <div className="showing-row">
                <label>
                  Phone
                  <input type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={set('phone')} required />
                </label>
                <label>
                  Email <span className="meta">(optional)</span>
                  <input type="email" autoComplete="email" value={f.email} onChange={set('email')} />
                </label>
              </div>
              <label>
                Message <span className="meta">(optional)</span>
                <textarea rows={3} value={f.message} onChange={set('message')} placeholder="Anything we should know?" />
              </label>
              {/* honeypot: hidden from people, bots fill it */}
              <label className="hp-field" aria-hidden="true">
                Website
                <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
              </label>
              {error ? <div className="showing-error" role="alert">{error}</div> : null}
              <button type="submit" className="btn big" disabled={busy}>{busy ? 'Sending…' : 'Request showing'}</button>
              <p className="showing-contact">
                Or call / text Marcel Najar: <a href="tel:2038183242">203-818-3242</a>
              </p>
              <a className="showing-agents" href={SHOWINGTIME_URL} target="_blank" rel="noopener noreferrer">
                Agents: book on ShowingTime ↗
              </a>
            </form>
          )}
        </Modal>
      ) : null}
    </>
  )
}
