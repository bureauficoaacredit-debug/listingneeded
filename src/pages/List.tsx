import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listingFeeUsd, type Listing, type ListingType } from '../lib/types'
import { getPaidTerm, insertListing, markPaidAndLive, uploadListingPhotos } from '../lib/store'
import { rememberMyListing } from '../lib/myListings'
import { paymentLinkForListing } from '../lib/checkout'
import { lookupPropertyFacts } from '../lib/propertyLookup'

const PENDING_KEY = 'listingneeded_pending_listing_id'
const PENDING_RENEW_KEY = 'listingneeded_pending_renew'

function uid() {
  return `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export default function List() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const canceled = searchParams.get('canceled') === '1'
  const paidReturn = searchParams.get('paid') === '1'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [listingType, setListingType] = useState<ListingType>('rent')
  const [termDays, setTermDays] = useState(90)

  useEffect(() => {
    void getPaidTerm().then((t) => setTermDays(t.days))
  }, [])

  // Public-record autofill (beds / baths / sq ft / year built). Values stay editable; the user's own
  // edits are never overwritten by a later lookup.
  const [addr, setAddr] = useState({ address: '', city: 'Fairfield', state: 'CT', zip: '' })
  const [facts, setFacts] = useState({ beds: '2', baths: '1', sqft: '', yearBuilt: '' })
  const touched = useRef<Set<string>>(new Set())
  const [lookup, setLookup] = useState<{ state: 'idle' | 'loading' | 'ok' | 'none'; msg: string }>({ state: 'idle', msg: '' })

  useEffect(() => {
    const a = addr.address.trim()
    if (!/^\d+[A-Za-z]?\s+\S{2,}/.test(a) || !addr.city.trim()) {
      setLookup({ state: 'idle', msg: '' })
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLookup({ state: 'loading', msg: 'Looking up public records…' })
      const r = await lookupPropertyFacts(addr, ctrl.signal)
      if (ctrl.signal.aborted) return
      if (!r.found) {
        setLookup({ state: 'none', msg: 'No public record found — enter the details yourself.' })
        return
      }
      setFacts((f) => ({
        beds: !touched.current.has('beds') && r.beds ? String(r.beds) : f.beds,
        baths: !touched.current.has('baths') && r.baths ? String(r.baths) : f.baths,
        sqft: !touched.current.has('sqft') && r.sqft ? String(Math.round(r.sqft)) : f.sqft,
        yearBuilt: !touched.current.has('yearBuilt') && r.yearBuilt ? String(r.yearBuilt) : f.yearBuilt,
      }))
      setLookup({
        state: 'ok',
        msg: `Filled from public records (${r.source ?? 'assessor'}) for ${r.matchedAddress ?? 'this address'}. Check and edit anything that’s off.`,
      })
    }, 700)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [addr])
  const setFact = (k: keyof typeof facts) => (e: React.ChangeEvent<HTMLInputElement>) => {
    touched.current.add(k)
    setFacts((f) => ({ ...f, [k]: e.target.value }))
  }

  // After Stripe Payment Link redirect (?paid=1), activate the listing we saved before leaving.
  useEffect(() => {
    if (!paidReturn) return
    let cancelled = false
    ;(async () => {
      const id = localStorage.getItem(PENDING_KEY)
      if (!id) {
        setStatus('Payment received, but no pending listing was found on this device. Check Admin or try listing again.')
        return
      }
      setBusy(true)
      try {
        const renew = localStorage.getItem(PENDING_RENEW_KEY) === '1'
        await markPaidAndLive(id, { renew })
        localStorage.removeItem(PENDING_KEY)
        localStorage.removeItem(PENDING_RENEW_KEY)
        rememberMyListing(id)
        if (!cancelled) navigate(`/listing/${id}?${renew ? 'renewed=1' : 'listed=1'}`, { replace: true })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not activate listing after payment')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [paidReturn, navigate])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setStatus('')
    setBusy(true)
    try {
      const fd = new FormData(e.currentTarget)
      const selectedType = fd.get('type') as ListingType
      const photosEl = e.currentTarget.elements.namedItem('photos') as HTMLInputElement | null
      const photoFiles = photosEl?.files ? Array.from(photosEl.files).slice(0, 6).filter((f) => f.size > 0) : []

      const id = uid()
      const draft: Listing = {
        id,
        type: selectedType,
        address: String(fd.get('address') || '').trim(),
        city: String(fd.get('city') || '').trim(),
        state: String(fd.get('state') || 'CT').trim(),
        zip: String(fd.get('zip') || '').trim(),
        beds: Number(fd.get('beds') || 0),
        baths: Number(fd.get('baths') || 0),
        sqft: Number(fd.get('sqft') || 0) || null,
        yearBuilt: Number(fd.get('yearBuilt') || 0) || null,
        price: Number(fd.get('price') || 0),
        pets: fd.get('pets') as Listing['pets'],
        description: String(fd.get('description') || '').trim(),
        photoDataUrls: [],
        ownerName: String(fd.get('ownerName') || '').trim(),
        ownerPhone: String(fd.get('ownerPhone') || '').trim(),
        ownerEmail: String(fd.get('ownerEmail') || '').trim(),
        createdAt: new Date().toISOString(),
        paid: false,
        live: false,
      }
      if (!draft.address || !draft.ownerPhone || !draft.ownerEmail || !draft.price) {
        throw new Error('Address, price, phone, and email are required.')
      }

      if (photoFiles.length) {
        const photoUrls = await uploadListingPhotos(id, photoFiles)
        if (!photoUrls.length) throw new Error('Could not upload photos. Try JPG or PNG.')
        draft.photoDataUrls = photoUrls
      }

      await insertListing(draft)
      localStorage.setItem(PENDING_KEY, draft.id)
      localStorage.removeItem(PENDING_RENEW_KEY)
      rememberMyListing(draft.id)

      const url = paymentLinkForListing({
        listingId: draft.id,
        type: draft.type,
        email: draft.ownerEmail,
      })
      window.location.href = url
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : 'Could not create listing'
      setError(message || 'Could not create listing')
      setBusy(false)
    }
  }

  if (paidReturn && busy) {
    return <div className="card"><div className="body">Payment received — publishing your listing…</div></div>
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <h2>List your home</h2>
      <p className="note">
        Fully automated self-serve listing: pay on Stripe, return here, and your listing goes live.
        Want a Realtor® instead? Call 203-818-3242 for a consultation.
      </p>
      {canceled ? (
        <div className="fee-box">Payment canceled — submit again when you’re ready to pay.</div>
      ) : null}
      {status ? <div className="success">{status}</div> : null}
      <div className="fee-box">
        <strong>One-time fee: ${listingFeeUsd(listingType)}</strong>
        <div>Rent $99 or sale $800. You’ll pay on Stripe’s secure page. Your listing stays live for <strong>{termDays} days</strong> from the payment date; you can renew it any time.</div>
      </div>

      <div className="row">
        <label>Type
          <select name="type" value={listingType} onChange={(e) => setListingType(e.target.value as ListingType)} required>
            <option value="rent">For rent — $99</option>
            <option value="sale">For sale — $800</option>
          </select>
        </label>
        <label>Ask / rent price ($)
          <input name="price" type="number" min={1} step={1} required placeholder="2700" />
        </label>
      </div>

      <label>Street address
        <input
          name="address"
          required
          placeholder="21 Ardmore St Fl 2"
          value={addr.address}
          onChange={(e) => setAddr((a) => ({ ...a, address: e.target.value }))}
        />
      </label>
      <div className="row">
        <label>City<input name="city" required value={addr.city} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} /></label>
        <label>State<input name="state" required value={addr.state} maxLength={2} onChange={(e) => setAddr((a) => ({ ...a, state: e.target.value.toUpperCase() }))} /></label>
        <label>ZIP<input name="zip" required placeholder="06824" value={addr.zip} onChange={(e) => setAddr((a) => ({ ...a, zip: e.target.value }))} /></label>
      </div>
      {lookup.state !== 'idle' ? (
        <div className={`autofill-note ${lookup.state}`} role="status">{lookup.msg}</div>
      ) : null}
      <div className="row">
        <label>Beds<input name="beds" type="number" min={0} step={1} required value={facts.beds} onChange={setFact('beds')} /></label>
        <label>Baths<input name="baths" type="number" min={0} step={0.5} required value={facts.baths} onChange={setFact('baths')} /></label>
        <label>Sq ft<input name="sqft" type="number" min={0} step={1} placeholder="optional" value={facts.sqft} onChange={setFact('sqft')} /></label>
        <label>Year built<input name="yearBuilt" type="number" min={1600} max={2100} step={1} placeholder="optional" value={facts.yearBuilt} onChange={setFact('yearBuilt')} /></label>
      </div>
      <div className="row">
        <label>Pets
          <select name="pets" defaultValue="no">
            <option value="no">No pets</option>
            <option value="yes">Pets OK</option>
            <option value="negotiable">Negotiable</option>
          </select>
        </label>
      </div>
      <label>Description
        <textarea name="description" rows={4} placeholder="What should renters or buyers know?" />
      </label>
      <label>Photos (up to 6)
        <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
      </label>

      <h3 style={{ margin: '0.5rem 0 0' }}>Your contact (shown on your live listing)</h3>
      <div className="row">
        <label>Name<input name="ownerName" required placeholder="Your name" /></label>
        <label>Phone<input name="ownerPhone" required placeholder="203-555-0100" /></label>
        <label>Email<input name="ownerEmail" type="email" required placeholder="you@email.com" /></label>
      </div>

      {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
      <button className="btn big" type="submit" disabled={busy}>
        {busy ? 'Starting Stripe…' : `Pay $${listingFeeUsd(listingType)} with Stripe`}
      </button>
      <p className="note">
        After payment, Stripe emails a receipt to the address you entered and can also notify Listing Needed
        at the business inbox. Stripe then sends you back here and the listing publishes automatically.
      </p>
    </form>
  )
}
