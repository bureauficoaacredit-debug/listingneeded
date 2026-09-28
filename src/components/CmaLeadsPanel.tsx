import { Fragment, useEffect, useState, type FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { fetchCmaLeads, money, type CmaLead } from '../lib/cma'

const CODE_KEY = 'listingneeded_cma_leads_code'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })

function readCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) || ''
  } catch {
    return ''
  }
}

/** Flat rows for Excel / CSV. */
function leadsToRows(leads: CmaLead[]) {
  return leads.map((l) => ({
    'Date (ET)': fmtDate(l.created_at),
    Name: l.name,
    Email: l.email,
    Phone: l.phone,
    Address: l.address,
    Estimate: l.estimate ?? '',
    'Range low': l.estimate_low ?? '',
    'Range high': l.estimate_high ?? '',
    'Beds (entered)': l.beds ?? '',
    'Baths (entered)': l.baths ?? '',
    'Sq ft (entered)': l.sqft ?? '',
    Comps: l.comps_count ?? '',
    Summary: l.result_summary ?? '',
    'Created (UTC)': l.created_at,
    ID: l.id,
  }))
}

function download(leads: CmaLead[], kind: 'xlsx' | 'csv') {
  const ws = XLSX.utils.json_to_sheet(leadsToRows(leads))
  ws['!cols'] = [18, 22, 30, 16, 40, 12, 12, 12, 8, 8, 8, 7, 70, 26, 38].map((wch) => ({ wch }))
  const stamp = new Date().toISOString().slice(0, 10)
  if (kind === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws)
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cma-leads-${stamp}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    return
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'CMA leads')
  XLSX.writeFile(wb, `cma-leads-${stamp}.xlsx`)
}

export default function CmaLeadsPanel() {
  const [code, setCode] = useState(readCode)
  const [codeInput, setCodeInput] = useState('')
  const [leads, setLeads] = useState<CmaLead[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  async function load(c: string) {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchCmaLeads(c)
      setLeads(rows)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load leads')
      return false
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (code) void load(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    const c = codeInput.trim().toUpperCase()
    if (!c) return
    if (await load(c)) {
      try {
        localStorage.setItem(CODE_KEY, c)
      } catch {
        /* private mode: keep for this session only */
      }
      setCode(c)
      setCodeInput('')
    }
  }

  function forget() {
    try {
      localStorage.removeItem(CODE_KEY)
    } catch {
      /* ignore */
    }
    setCode('')
    setLeads(null)
  }

  if (!code || (!leads && error)) {
    return (
      <section className="card" style={{ maxWidth: 520 }}>
        <form className="body" style={{ display: 'grid', gap: '.75rem' }} onSubmit={submitCode}>
          <h2 style={{ margin: 0 }}>CMA Leads</h2>
          <p className="meta" style={{ margin: 0 }}>
            Enter the leads access code (format XXXXX-XXXXX-XXXXX-XXXXX-XXXXX). It is not stored in the website
            code; this browser remembers it after the first time.
          </p>
          <label>
            Access code
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
            />
          </label>
          {error ? <div style={{ color: '#b91c1c', fontSize: '.92rem' }}>{error}</div> : null}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Show leads'}
          </button>
        </form>
      </section>
    )
  }

  const list = leads || []
  return (
    <section className="card">
      <div className="body" style={{ display: 'grid', gap: '.85rem' }}>
        <div className="leads-head">
          <div>
            <h2 style={{ margin: '0 0 .3rem' }}>CMA Leads ({list.length})</h2>
            <p className="meta" style={{ margin: 0 }}>
              Everyone who ran “What’s my home worth?” (<a href="/#/cma">/cma</a>). Newest first. Click a row for
              details.
            </p>
          </div>
          <div className="leads-actions">
            <button type="button" className="btn" onClick={() => download(list, 'xlsx')} disabled={!list.length}>
              Download leads (Excel)
            </button>
            <button type="button" className="btn secondary" onClick={() => download(list, 'csv')} disabled={!list.length}>
              CSV
            </button>
            <button type="button" className="btn ghost" onClick={() => void load(code)} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button type="button" className="btn ghost" onClick={forget} title="Remove the saved access code from this browser">
              Forget code
            </button>
          </div>
        </div>
        {error ? <div style={{ color: '#b91c1c', fontSize: '.92rem' }}>{error}</div> : null}
        {list.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table leads-table">
              <thead>
                <tr>
                  <th>Date (ET)</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Estimate</th>
                </tr>
              </thead>
              <tbody>
                {list.map((l) => {
                  const open = openId === l.id
                  return (
                    <Fragment key={l.id}>
                      <tr
                        className={`lead-row${open ? ' open' : ''}`}
                        onClick={() => setOpenId(open ? null : l.id)}
                        aria-expanded={open}
                      >
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.created_at)}</td>
                        <td><strong>{l.name}</strong></td>
                        <td>
                          <a href={`mailto:${l.email}`} onClick={(e) => e.stopPropagation()}>{l.email}</a>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <a href={`tel:${l.phone.replace(/\D/g, '')}`} onClick={(e) => e.stopPropagation()}>{l.phone}</a>
                        </td>
                        <td>{l.address}</td>
                        <td style={{ whiteSpace: 'nowrap' }}><strong>{money(l.estimate)}</strong></td>
                      </tr>
                      {open ? (
                        <tr className="lead-detail">
                          <td colSpan={6}>
                            <dl>
                              <dt>Estimate range</dt>
                              <dd>{l.estimate_low ? `${money(l.estimate_low)} – ${money(l.estimate_high)}` : '—'}</dd>
                              <dt>Entered details</dt>
                              <dd>{l.beds ?? '—'} bd · {l.baths ?? '—'} ba · {l.sqft ?? '—'} sq ft</dd>
                              <dt>Comps used</dt>
                              <dd>{l.comps_count ?? '—'}</dd>
                              <dt>Result</dt>
                              <dd>{l.result_summary || '—'}</dd>
                              <dt>Contact</dt>
                              <dd>
                                <a className="btn" href={`tel:${l.phone.replace(/\D/g, '')}`}>Call {l.phone}</a>{' '}
                                <a
                                  className="btn secondary"
                                  href={`mailto:${l.email}?subject=${encodeURIComponent(`Your home value — ${l.address}`)}`}
                                >
                                  Email {l.name.split(' ')[0]}
                                </a>{' '}
                                <a className="btn ghost" href={`sms:${l.phone.replace(/\D/g, '')}`}>Text</a>
                              </dd>
                              <dt>Lead ID</dt>
                              <dd className="meta">{l.id}</dd>
                            </dl>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <p className="meta" style={{ margin: 0 }}>No CMA requests yet.</p>
        ) : null}
      </div>
    </section>
  )
}
