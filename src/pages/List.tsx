import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { listingFeeUsd, type Listing, type ListingType } from '../lib/types'
import { insertListing, markPaidAndLive, uploadListingPhotos } from '../lib/store'

function uid() {
  return `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export default function List() {
  const navigate = useNavigate()
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
      const fee = listingFeeUsd(selectedType)
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

      // Upload photos first when possible, then insert with public URLs.
      let photoUrls: string[] = []
      if (photoFiles.length) {
        photoUrls = await uploadListingPhotos(id, photoFiles)
        if (!photoUrls.length) {
          throw new Error('Could not upload photos. Try JPG or PNG.')
        }
        draft.photoDataUrls = photoUrls
      }

      await insertListing(draft)

      // Demo checkout: in production replace with Stripe Checkout Session for the selected fee.
      // For now, confirm fee and activate immediately so the flow is fully self-serve.
      const ok = window.confirm(
        `Pay $${fee} listing fee now?

After payment your listing goes live and people contact you directly.`,
      )
      if (!ok) {
        setBusy(false)
        return
      }
      await markPaidAndLive(draft.id)
      navigate(`/listing/${draft.id}?listed=1`)
    } catch (err) {
      // Supabase may throw plain objects; prefer message/code over a generic fallback.
      const message =
        err instanceof Error
          ? err.message
          : err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : err && typeof err === 'object'
              ? JSON.stringify(err)
              : 'Could not create listing'
      setError(message || 'Could not create listing')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <h2>List your home</h2>
      <p className="note">
        Sell it, rent it, or call us for a consultation. Self-serve listings go live after payment,
        and interested people contact you directly.
      </p>
      <div className="fee-box">
        <strong>One-time fee: ${listingFeeUsd(listingType)}</strong>
        <div>Rent for $200 or sell for $800. Choose the listing type below; photos and your contact stay with your listing.</div>
      </div>

      <div className="row">
        <label>Type
          <select name="type" value={listingType} onChange={(e) => setListingType(e.target.value as ListingType)} required>
            <option value="rent">For rent — $200</option>
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
        {busy ? 'Working…' : `Pay $${listingFeeUsd(listingType)} & publish`}
      </button>
      <p className="note">
        Photos are uploaded to cloud storage when available. Payment is confirmed in-app for this demo;
        production should use Stripe Checkout.
      </p>
    </form>
  )
}
