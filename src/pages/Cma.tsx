import { useState, type FormEvent } from 'react'
import {
  formatPhoneInput,
  isValidEmail,
  money,
  normalizeUsPhone,
  requestCma,
  type CmaResponse,
} from '../lib/cma'

type Form = {
  address: string
  beds: string
  baths: string
  sqft: string
  name: string
  email: string
  phone: string
  website: string
}

const empty: Form = { address: '', beds: '', baths: '', sqft: '', name: '', email: '', phone: '', website: '' }
const n = (v: number | null | undefined, suffix = '') => (v == null ? '—' : `${v.toLocaleString('en-US')}${suffix}`)

export default function Cma() {
  const [form, setForm] = useState<Form>(empty)
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<CmaResponse | null>(null)
  const [sentTo, setSentTo] = useState('')

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === 'phone' ? formatPhoneInput(e.target.value) : e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs: Partial<Record<keyof Form, string>> = {}
    if (form.address.trim().length < 5) errs.address = 'Enter the full property address.'
    if (!form.name.trim()) errs.name = 'Name is required.'
    if (!isValidEmail(form.email)) errs.email = 'Enter a valid email.'
    if (!normalizeUsPhone(form.phone)) errs.phone = 'Enter a valid 10-digit US phone number.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setError('')
    setData(null)
    try {
      const res = await requestCma({ ...form, phone: normalizeUsPhone(form.phone) })
      setData(res)
      setSentTo(form.email.trim())
      setTimeout(() => document.getElementById('cma-results')?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const r = data?.result

  return (
    <div className="cma">
      <section className="cma-hero">
        <p className="eyebrow eyebrow-soft">Free CMA · Fairfield County, CT</p>
        <h1>What’s my home worth?</h1>
        <p className="lead">
          Get an instant comparative market analysis from recorded Connecticut sales, town assessor records
          and active listings. See it on screen, with a copy by email.
        </p>
      </section>

      <form className="form cma-form" onSubmit={onSubmit} noValidate>
        <h2>Property</h2>
        <label>
          Address *
          <input
            value={form.address}
            onChange={set('address')}
            placeholder="123 Main St, Westport, CT 06880"
            autoComplete="street-address"
            aria-invalid={!!errors.address}
          />
          {errors.address ? <span className="field-error">{errors.address}</span> : null}
        </label>
        <div className="row">
          <label>
            Beds <span className="meta">(optional)</span>
            <input inputMode="numeric" value={form.beds} onChange={set('beds')} placeholder="From records" />
          </label>
          <label>
            Baths <span className="meta">(optional)</span>
            <input inputMode="decimal" value={form.baths} onChange={set('baths')} placeholder="From records" />
          </label>
          <label>
            Sq ft <span className="meta">(optional)</span>
            <input inputMode="numeric" value={form.sqft} onChange={set('sqft')} placeholder="From records" />
          </label>
        </div>

        <h2>Where should we send your report?</h2>
        <div className="row">
          <label>
            Name *
            <input value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={!!errors.name} />
            {errors.name ? <span className="field-error">{errors.name}</span> : null}
          </label>
          <label>
            Email *
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
              aria-invalid={!!errors.email}
            />
            {errors.email ? <span className="field-error">{errors.email}</span> : null}
          </label>
          <label>
            Phone *
            <input
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="(203) 555-0123"
              autoComplete="tel-national"
              aria-invalid={!!errors.phone}
            />
            {errors.phone ? <span className="field-error">{errors.phone}</span> : null}
          </label>
        </div>
        <input
          className="hp-field"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={form.website}
          onChange={set('website')}
          name="website"
        />
        {error ? <div className="cma-error">{error}</div> : null}
        <button className="btn big" type="submit" disabled={busy}>
          {busy ? 'Pulling comps… (about 10 seconds)' : 'Show my home value'}
        </button>
        <p className="meta" style={{ margin: 0 }}>
          Name, email and phone are required to see results. Marcel Najar, Licensed Realtor®, may follow up.
          We never sell your info.
        </p>
      </form>

      {r ? (
        <section id="cma-results" className="cma-results">
          <div className={data?.emailed ? 'success' : 'cma-note'}>
            {data?.emailed
              ? `A copy of this report was emailed to ${sentTo}.`
              : 'Your request was received. Marcel will follow up with a full report.'}
          </div>

          <div className="card cma-estimate">
            <p className="cma-kicker">Estimated value · {r.subject.matchedAddress}</p>
            <div className="cma-value">{r.estimate ? money(r.estimate.value) : 'Not enough data'}</div>
            {r.estimate ? (
              <p className="cma-range">
                Likely range {money(r.estimate.low)} – {money(r.estimate.high)}
              </p>
            ) : null}
            <ul className="cma-facts">
              <li>{r.subject.propertyType}{r.subject.style ? ` · ${r.subject.style}` : ''}</li>
              <li>{n(r.subject.beds)} bd · {n(r.subject.baths)} ba</li>
              <li>{n(r.subject.sqft)} sq ft</li>
              {r.subject.yearBuilt ? <li>Built {r.subject.yearBuilt}</li> : null}
              {r.subject.assessed ? <li>Assessed {money(r.subject.assessed)}</li> : null}
              {r.subject.lastSalePrice ? (
                <li>
                  Last sale {money(r.subject.lastSalePrice)}
                  {r.subject.lastSaleDate ? ` (${r.subject.lastSaleDate})` : ''}
                </li>
              ) : null}
            </ul>
          </div>

          <div className="cma-stats">
            <div className="card"><span>Avg sold</span><strong>{money(r.stats.soldAvg)}</strong></div>
            <div className="card"><span>Median sold</span><strong>{money(r.stats.soldMedian)}</strong></div>
            <div className="card">
              <span>Median $/sq ft</span>
              <strong>{r.stats.soldMedianPpsf ? `$${r.stats.soldMedianPpsf}` : '—'}</strong>
            </div>
            <div className="card">
              <span>Median active</span>
              <strong>{money(r.stats.activeMedian)}</strong>
            </div>
          </div>

          {r.estimate?.methods.length ? (
            <div className="card">
              <div className="body">
                <h3>How we got there</h3>
                <ul className="cma-methods">
                  {r.estimate.methods.map((m) => (
                    <li key={m.name}>
                      <strong>{m.name}:</strong> {money(m.value)} <span className="meta">— {m.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="body">
              <h3>Comparable properties</h3>
              <div className="cma-table-wrap">
                <table className="admin-table cma-table">
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>Price</th>
                      <th>Status</th>
                      <th>Bd / Ba</th>
                      <th>Sq ft</th>
                      <th>Distance</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.comps.length ? (
                      r.comps.map((c, i) => (
                        <tr key={`${c.address}-${i}`}>
                          <td>
                            {c.url ? (
                              <a href={c.url} target="_blank" rel="noreferrer">{c.address}</a>
                            ) : (
                              c.address
                            )}
                            <div className="meta">{c.town}</div>
                          </td>
                          <td>
                            <strong>{money(c.price)}</strong>
                            {c.ppsf ? <div className="meta">${c.ppsf}/sq ft</div> : null}
                          </td>
                          <td>
                            <span className={`cma-status ${c.status === 'Sold' ? 'sold' : 'active'}`}>{c.status}</span>
                            {c.date ? <div className="meta">{c.date}</div> : null}
                          </td>
                          <td>{n(c.beds)} / {n(c.baths)}</td>
                          <td>{n(c.sqft)}</td>
                          <td>{c.distanceMi == null ? '—' : `${c.distanceMi} mi`}</td>
                          <td className="meta">{c.source}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7}>No comparable properties found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="body cma-sources">
              <h3>Data sources</h3>
              <ul>
                {r.sources.map((s) => (
                  <li key={s.name}>
                    <strong>{s.name}</strong> — <em>{s.status}</em>
                    {s.detail ? <span className="meta"> · {s.detail}</span> : null}
                  </li>
                ))}
              </ul>
              {r.notes.length ? (
                <ul className="meta">
                  {r.notes.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : null}
              <p className="meta cma-disclaimer">{r.disclaimer}</p>
            </div>
          </div>

          <section className="realtor-band realtor-centered">
            <p className="eyebrow light">Licensed Realtor®</p>
            <h2>Want an exact number?</h2>
            <p>Marcel Najar can walk through your home and prepare a full CMA.</p>
            <div className="hero-actions hero-actions-center">
              <a className="btn big" href="tel:2038183242">Call 203-818-3242</a>
              <a className="btn secondary" href="https://www.listingneeded.com">www.listingneeded.com</a>
            </div>
          </section>
        </section>
      ) : null}
    </div>
  )
}
