import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listingFeeUsd, type Listing, type ListingType } from '../lib/types'
import { insertListing, uploadListingPhotos } from '../lib/store'

function uid() {
  return `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export default function List() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const canceled = searchParams.get('canceled') === '1'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [listingType, setListingType] = useState<ListingType>('rent')

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
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

      let photoUrls: string[] = []
      if (photoFiles.length) {
        photoUrls = await uploadListingPhotos(id, photoFiles)
        if (!photoUrls.length) {
          throw new Error('Could not upload photos. Try JPG or PNG.')
        }
        draft.photoDataUrls = photoUrls
      }

      await insertListing(draft)

      const checkoutRes = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: draft.id,
          type: draft.type,
          email: draft.ownerEmail,
          address: draft.address,
        }),
      })
      const checkout = await checkoutRes.json().catch(() => ({}))
      if (!checkoutRes.ok || !checkout.url) {
        throw new Error(
          checkout.error ||
            'Could not start Stripe Checkout. Add STRIPE_SECRET_KEY in Vercel, then redeploy.',
        )
      }

      window.location.href = checkout.url
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : err && typeof err === 'object'
              ? JSON.stringify(err)
              : 'Could not create listing'
      setError(message || 'Could not create listing')
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <h2>List your home</h2>
      <p className="note">
        Fully automated self-serve listing: pay online with Stripe, go live, and get contacted directly.
        Want a Realtor® instead? Call 203-818-3242 for a consultation.
      </p>
      {canceled ? (
        <div className="fee-box">Payment canceled — your draft was saved unpaid. Submit again when you’re ready to pay.</div>
      ) : null}
      <div className="fee-box">
        <strong>One-time fee: ${listingFeeUsd(listingType)}</strong>
        <div>Rent for $99 or sell for $800. You’ll pay securely on Stripe; the listing goes live after payment.</div>
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
        <input name="address" required placeholder="21 Ardmore St Fl 2" />
      </label>
      <div className="row">
        <label>City<input name="city" required defaultValue="Fairfield" /></label>
        <label>State<input name="state" required defaultValue="CT" maxLength={2} /></label>
        <label>ZIP<input name="zip" required placeholder="06824" /></label>
      </div>
      <div className="row">
        <label>Beds<input name="beds" type="number" min={0} step={1} required defaultValue={2} /></label>
        <label>Baths<input name="baths" type="number" min={0} step={0.5} required defaultValue={1} /></label>
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

      <h3 style={{margin:'0.5rem 0 0'}}>Your contact (shown on your live listing)</h3>
      <div className="row">
        <label>Name<input name="ownerName" required placeholder="Your name" /></label>
        <label>Phone<input name="ownerPhone" required placeholder="203-555-0100" /></label>
        <label>Email<input name="ownerEmail" type="email" required placeholder="you@email.com" /></label>
      </div>

      {error ? <div style={{color:'#b91c1c'}}>{error}</div> : null}
      <button className="btn big" type="submit" disabled={busy}>
        {busy ? 'Starting Stripe…' : `Pay $${listingFeeUsd(listingType)} with Stripe`}
      </button>
      <p className="note">
        You’ll leave this page for Stripe Checkout. After a successful payment you’ll return here and the listing goes live.
      </p>
    </form>
  )
}
