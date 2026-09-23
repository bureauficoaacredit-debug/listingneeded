import { useEffect, useState, type FormEvent } from 'react'
import type { Listing, ListingType, PartnerCategory, PartnerLink } from '../lib/types'
import { isActiveUntilOk, MLS_OWNER, PARTNER_CATEGORY_LABELS } from '../lib/types'
import {
  allListings,
  allPartnerLinks,
  deleteListing,
  deletePartnerLink,
  insertListing,
  insertListings,
  insertPartnerLink,
  updateListing,
  updatePartnerLink,
} from '../lib/store'
import { parseMlsPdf, type MlsDraft } from '../lib/pdfMls'

const SESSION_KEY = 'listingneeded_admin_ok'
const CATEGORIES = Object.keys(PARTNER_CATEGORY_LABELS) as PartnerCategory[]

function uid() {
  return `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

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

function statusLabel(l: Listing): string {
  const expired = !isActiveUntilOk(l.activeUntil)
  if (expired) return 'ended'
  if (l.live && l.paid) return 'active'
  if (l.live) return 'live (unpaid)'
  return 'inactive'
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
  url: '',
  category: 'mortgage',
  blurb: '',
  sortOrder: '0',
  enabled: true,
})

type AddForm = {
  type: ListingType
  address: string
  city: string
  state: string
  zip: string
  beds: string
  baths: string
  price: string
  pets: Listing['pets']
  description: string
  activeUntil: string
  live: boolean
}

const emptyAddForm = (): AddForm => ({
  type: 'sale',
  address: '',
  city: 'Fairfield',
  state: 'CT',
  zip: '',
  beds: '3',
  baths: '2',
  price: '',
  pets: 'no',
  description: '',
  activeUntil: '',
  live: true,
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
  const [addForm, setAddForm] = useState<AddForm>(emptyAddForm())
  const [savingAdd, setSavingAdd] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfDrafts, setPdfDrafts] = useState<MlsDraft[]>([])
  const [pdfName, setPdfName] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [endDateDrafts, setEndDateDrafts] = useState<Record<string, string>>({})

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
        if (!cancelled) {
          setListings(rows)
          const dates: Record<string, string> = {}
          for (const r of rows) {
            dates[r.id] = r.activeUntil?.slice(0, 10) ?? ''
          }
          setEndDateDrafts(dates)
        }
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
    setPdfDrafts([])
    setPdfName('')
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

  async function handleToggleLive(l: Listing) {
    setBusyId(l.id)
    setStatus('')
    setError('')
    try {
      const nextLive = !l.live
      // Admin MLS / inserts always stay paid=true when activating
      const updated = await updateListing(l.id, {
        live: nextLive,
        paid: nextLive ? true : l.paid,
      })
      setListings((prev) => prev.map((row) => (row.id === l.id ? updated : row)))
      setStatus(`${updated.address} is now ${updated.live ? 'active (live)' : 'inactive'}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSaveEndDate(l: Listing) {
    setBusyId(l.id)
    setStatus('')
    setError('')
    try {
      const raw = (endDateDrafts[l.id] ?? '').trim()
      const activeUntil = raw || null
      const updated = await updateListing(l.id, { activeUntil })
      setListings((prev) => prev.map((row) => (row.id === l.id ? updated : row)))
      setStatus(
        activeUntil
          ? `End date set to ${activeUntil} for ${updated.address}.`
          : `End date cleared for ${updated.address}.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save end date')
    } finally {
      setBusyId(null)
    }
  }

  async function handleAddListing(e: FormEvent) {
    e.preventDefault()
    setSavingAdd(true)
    setError('')
    setStatus('')
    try {
      const price = Number(addForm.price)
      if (!addForm.address.trim() || !price) {
        throw new Error('Address and price are required.')
      }
      const draft: Listing = {
        id: uid(),
        type: addForm.type,
        address: addForm.address.trim(),
        city: addForm.city.trim() || 'Fairfield',
        state: (addForm.state.trim() || 'CT').toUpperCase().slice(0, 2),
        zip: addForm.zip.trim(),
        beds: Number(addForm.beds) || 0,
        baths: Number(addForm.baths) || 0,
        price,
        pets: addForm.pets,
        description: addForm.description.trim(),
        photoDataUrls: [],
        ownerName: MLS_OWNER.name,
        ownerPhone: MLS_OWNER.phone,
        ownerEmail: MLS_OWNER.email,
        createdAt: new Date().toISOString(),
        paid: true,
        live: addForm.live,
        is_mls: true,
        activeUntil: addForm.activeUntil.trim() || null,
      }
      const created = await insertListing(draft)
      setListings((prev) => [created, ...prev])
      setEndDateDrafts((prev) => ({
        ...prev,
        [created.id]: created.activeUntil?.slice(0, 10) ?? '',
      }))
      setAddForm(emptyAddForm())
      setStatus(`Added MLS listing: ${created.address} (${created.live ? 'active' : 'inactive'}).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add listing')
    } finally {
      setSavingAdd(false)
    }
  }

  async function handlePdfFile(file: File | null) {
    if (!file) return
    setPdfBusy(true)
    setError('')
    setStatus('')
    setPdfDrafts([])
    setPdfName(file.name)
    try {
      const { drafts } = await parseMlsPdf(file)
      setPdfDrafts(drafts)
      setStatus(`Parsed ${drafts.length} candidate(s) from ${file.name}. Edit, then Publish all.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('MLS PDF parse failed:', err)
      setError(
        `PDF upload failed: ${msg}. Hard-refresh this page (Cmd+Shift+R), then try again. Image-only scans will not parse.`,
      )
      setPdfName('')
      setPdfDrafts([])
    } finally {
      setPdfBusy(false)
    }
  }

  function updateDraft(key: string, patch: Partial<MlsDraft>) {
    setPdfDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  function removeDraft(key: string) {
    setPdfDrafts((prev) => prev.filter((d) => d.key !== key))
  }

  async function handlePublishPdf() {
    const selected = pdfDrafts.filter((d) => d.include)
    if (!selected.length) {
      setError('No candidates selected to publish.')
      return
    }
    for (const d of selected) {
      if (!d.address.trim() || !d.price) {
        setError('Every selected row needs an address and price. Fix the preview table first.')
        return
      }
    }
    if (!confirm(`Publish ${selected.length} MLS listing(s) as live + paid for ${MLS_OWNER.name}?`)) {
      return
    }
    setPublishing(true)
    setError('')
    setStatus('')
    try {
      const payloads: Listing[] = selected.map((d) => ({
        id: uid(),
        type: d.type,
        address: d.address.trim(),
        city: d.city.trim() || 'Fairfield',
        state: (d.state.trim() || 'CT').toUpperCase().slice(0, 2),
        zip: d.zip.trim(),
        beds: Number(d.beds) || 0,
        baths: Number(d.baths) || 0,
        price: Number(d.price) || 0,
        pets: d.pets,
        description: d.description.trim(),
        photoDataUrls: [],
        ownerName: MLS_OWNER.name,
        ownerPhone: MLS_OWNER.phone,
        ownerEmail: MLS_OWNER.email,
        createdAt: new Date().toISOString(),
        paid: true,
        live: true,
        is_mls: true,
        activeUntil: null,
      }))
      const { ok, failed } = await insertListings(payloads)
      if (ok.length) {
        setListings((prev) => [...ok, ...prev])
        setEndDateDrafts((prev) => {
          const next = { ...prev }
          for (const row of ok) next[row.id] = ''
          return next
        })
      }
      if (failed.length) {
        setError(`${failed.length} failed to insert. First error: ${failed[0].error}`)
      }
      setStatus(`Published ${ok.length} MLS listing(s)${failed.length ? `, ${failed.length} failed` : ''}.`)
      if (!failed.length) {
        setPdfDrafts([])
        setPdfName('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk publish failed')
    } finally {
      setPublishing(false)
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
            MLS backdoor for {MLS_OWNER.name}: add/remove, active toggle, end date, PDF bulk publish.
            Owner defaults to {MLS_OWNER.name} · {MLS_OWNER.phone}.
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

      {/* PDF upload → preview → publish */}
      <section className="card">
        <div className="body" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>MLS PDF scan</h2>
            <p className="meta" style={{ margin: 0 }}>
              Upload a sheet / MLS PDF. Text is extracted in-browser, candidates appear in an editable
              table, then one-click publish as is_mls + paid + live for {MLS_OWNER.name}.
            </p>
          </div>
          <label>
            PDF file
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={pdfBusy || publishing}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                void handlePdfFile(f)
                e.target.value = ''
              }}
            />
          </label>
          {pdfBusy ? <p className="meta">Reading PDF…</p> : null}
          {pdfName && !pdfBusy ? <p className="meta">File: {pdfName}</p> : null}

          {pdfDrafts.length > 0 ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Use</th>
                      <th>Type</th>
                      <th>Address</th>
                      <th>City</th>
                      <th>ST</th>
                      <th>ZIP</th>
                      <th>Price</th>
                      <th>Beds</th>
                      <th>Baths</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pdfDrafts.map((d) => (
                      <tr key={d.key} style={{ opacity: d.include ? 1 : 0.45 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={d.include}
                            onChange={(e) => updateDraft(d.key, { include: e.target.checked })}
                          />
                        </td>
                        <td>
                          <select
                            value={d.type}
                            onChange={(e) => updateDraft(d.key, { type: e.target.value as ListingType })}
                          >
                            <option value="sale">sale</option>
                            <option value="rent">rent</option>
                          </select>
                        </td>
                        <td>
                          <input
                            value={d.address}
                            onChange={(e) => updateDraft(d.key, { address: e.target.value })}
                            style={{ minWidth: 140 }}
                          />
                        </td>
                        <td>
                          <input
                            value={d.city}
                            onChange={(e) => updateDraft(d.key, { city: e.target.value })}
                            style={{ width: 100 }}
                          />
                        </td>
                        <td>
                          <input
                            value={d.state}
                            maxLength={2}
                            onChange={(e) =>
                              updateDraft(d.key, {
                                state: e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase(),
                              })
                            }
                            style={{ width: 44 }}
                          />
                        </td>
                        <td>
                          <input
                            value={d.zip}
                            onChange={(e) => updateDraft(d.key, { zip: e.target.value })}
                            style={{ width: 80 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={d.price || ''}
                            onChange={(e) => updateDraft(d.key, { price: Number(e.target.value) || 0 })}
                            style={{ width: 100 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={d.beds}
                            onChange={(e) => updateDraft(d.key, { beds: Number(e.target.value) || 0 })}
                            style={{ width: 56 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step={0.5}
                            value={d.baths}
                            onChange={(e) => updateDraft(d.key, { baths: Number(e.target.value) || 0 })}
                            style={{ width: 56 }}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() => removeDraft(d.key)}
                          >
                            Drop
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  disabled={publishing}
                  onClick={() => void handlePublishPdf()}
                >
                  {publishing
                    ? 'Publishing…'
                    : `Publish ${pdfDrafts.filter((d) => d.include).length} as MLS live`}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={publishing}
                  onClick={() => {
                    setPdfDrafts([])
                    setPdfName('')
                  }}
                >
                  Clear preview
                </button>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {/* Add one listing */}
      <section className="card">
        <div className="body" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>Add one listing</h2>
            <p className="meta" style={{ margin: 0 }}>
              Inserts as is_mls=true, paid=true. Contact: {MLS_OWNER.name} · {MLS_OWNER.phone}.
            </p>
          </div>
          <form
            className="form"
            style={{ boxShadow: 'none', border: '1px solid var(--line)' }}
            onSubmit={handleAddListing}
          >
            <div className="row">
              <label>
                Type
                <select
                  value={addForm.type}
                  onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value as ListingType }))}
                >
                  <option value="sale">For sale</option>
                  <option value="rent">For rent</option>
                </select>
              </label>
              <label>
                Price ($)
                <input
                  required
                  type="number"
                  min={1}
                  value={addForm.price}
                  onChange={(e) => setAddForm((f) => ({ ...f, price: e.target.value }))}
                />
              </label>
              <label>
                End date (optional)
                <input
                  type="date"
                  value={addForm.activeUntil}
                  onChange={(e) => setAddForm((f) => ({ ...f, activeUntil: e.target.value }))}
                />
              </label>
            </div>
            <label>
              Street address
              <input
                required
                value={addForm.address}
                onChange={(e) => setAddForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="21 Ardmore St"
              />
            </label>
            <div className="row">
              <label>
                City
                <input
                  value={addForm.city}
                  onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))}
                />
              </label>
              <label>
                State
                <input
                  maxLength={2}
                  value={addForm.state}
                  onChange={(e) =>
                    setAddForm((f) => ({
                      ...f,
                      state: e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase(),
                    }))
                  }
                />
              </label>
              <label>
                ZIP
                <input
                  value={addForm.zip}
                  onChange={(e) => setAddForm((f) => ({ ...f, zip: e.target.value }))}
                />
              </label>
            </div>
            <div className="row">
              <label>
                Beds
                <input
                  type="number"
                  min={0}
                  value={addForm.beds}
                  onChange={(e) => setAddForm((f) => ({ ...f, beds: e.target.value }))}
                />
              </label>
              <label>
                Baths
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={addForm.baths}
                  onChange={(e) => setAddForm((f) => ({ ...f, baths: e.target.value }))}
                />
              </label>
              <label>
                Pets
                <select
                  value={addForm.pets}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, pets: e.target.value as Listing['pets'] }))
                  }
                >
                  <option value="no">No pets</option>
                  <option value="yes">Pets OK</option>
                  <option value="negotiable">Negotiable</option>
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea
                rows={3}
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={addForm.live}
                onChange={(e) => setAddForm((f) => ({ ...f, live: e.target.checked }))}
              />
              Active (live) immediately
            </label>
            <button type="submit" className="btn" disabled={savingAdd}>
              {savingAdd ? 'Saving…' : 'Add MLS listing'}
            </button>
          </form>
        </div>
      </section>

      {/* All listings with toggle / end date / delete */}
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
                  <th>Status</th>
                  <th>MLS</th>
                  <th>End date</th>
                  <th>Owner</th>
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
                      <span className="badge">{statusLabel(l)}</span>
                      <div className="meta">
                        {l.live ? 'live' : 'off'} / {l.paid ? 'paid' : 'unpaid'}
                      </div>
                    </td>
                    <td>{l.is_mls ? 'yes' : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="date"
                          value={endDateDrafts[l.id] ?? ''}
                          onChange={(e) =>
                            setEndDateDrafts((prev) => ({ ...prev, [l.id]: e.target.value }))
                          }
                          style={{ fontSize: '0.85rem' }}
                        />
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem' }}
                          disabled={busyId === l.id}
                          onClick={() => void handleSaveEndDate(l)}
                        >
                          Save
                        </button>
                        {(endDateDrafts[l.id] || l.activeUntil) && (
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem' }}
                            disabled={busyId === l.id}
                            onClick={() => {
                              setEndDateDrafts((prev) => ({ ...prev, [l.id]: '' }))
                              void (async () => {
                                setBusyId(l.id)
                                try {
                                  const updated = await updateListing(l.id, { activeUntil: null })
                                  setListings((prev) =>
                                    prev.map((row) => (row.id === l.id ? updated : row)),
                                  )
                                  setStatus(`Cleared end date for ${updated.address}.`)
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Clear failed')
                                } finally {
                                  setBusyId(null)
                                }
                              })()
                            }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>
                      {l.ownerName}
                      <div className="meta">{l.ownerPhone}</div>
                    </td>
                    <td className="meta">{formatDate(l.createdAt)}</td>
                    <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                        disabled={busyId === l.id}
                        onClick={() => void handleToggleLive(l)}
                      >
                        {l.live ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        disabled={busyId === l.id}
                        onClick={() => void handleDelete(l.id)}
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

      {/* Partner links (unchanged capability) */}
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
              </div>
            </div>
          ) : null}

          <form
            className="form"
            style={{ boxShadow: 'none', border: '1px solid var(--line)', opacity: partnerSetupError ? 0.55 : 1 }}
            onSubmit={handleAddLink}
          >
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
                placeholder="www.rocketmortgage.com or https://..."
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

          {links.length === 0 ? (
            <p className="meta">No partner links yet.</p>
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
                          onClick={() => void toggleLink(link)}
                        >
                          {link.enabled ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          disabled={busyId === link.id}
                          onClick={() => void removeLink(link)}
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
    </div>
  )
}
