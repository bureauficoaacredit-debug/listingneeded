import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LISTING_FEE_USD, type Listing, type ListingType } from '../lib/types'
import { upsertListing, markPaidAndLive } from '../lib/store'

function uid() {
  return `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function filesToDataUrls(files: FileList | null, max = 6) {
  if (!files) return [] as string[]
  const selected = Array.from(files).slice(0, max)
  const reads = selected.map(
    (file) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      }),
  )
  return Promise.all(reads)
}

export default function List() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const fd = new FormData(e.currentTarget)
      const photos = await filesToDataUrls(fd.get('photos') as FileList | null)
      const draft: Listing = {
        id: uid(),
        type: fd.get('type') as ListingType,
        address: String(fd.get('address') || '').trim(),
        city: String(fd.get('city') || '').trim(),
        state: String(fd.get('state') || 'CT').trim(),
        zip: String(fd.get('zip') || '').trim(),
        beds: Number(fd.get('beds') || 0),
        baths: Number(fd.get('baths') || 0),
        price: Number(fd.get('price') || 0),
        pets: fd.get('pets') as Listing['pets'],
        description: String(fd.get('description') || '').trim(),
        photoDataUrls: photos,
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
      upsertListing(draft)

      // Demo checkout: in production replace with Stripe Checkout Session for $200.
      // For now, confirm fee and activate immediately so the flow is fully self-serve.
      const ok = window.confirm(
        `Pay $${LISTING_FEE_USD} listing fee now?\n\nAfter payment your listing goes live and people contact you directly.`,
      )
      if (!ok) {
        setBusy(false)
        return
      }
      markPaidAndLive(draft.id)
      navigate(`/listing/${draft.id}?listed=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create listing')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <h2>List your home — ${LISTING_FEE_USD}</h2>
      <p className="note">
        Fully automated. After you pay, your listing goes live and interested people contact you
        directly. Listing Needed does not sit in the middle.
      </p>
      <div className="fee-box">
        <strong>${LISTING_FEE_USD} one-time listing fee</strong>
        <div>Rent or sale. Photos + your contact stay with your listing.</div>
      </div>

      <div className="row">
        <label>Type
          <select name="type" defaultValue="rent" required>
            <option value="rent">For rent</option>
            <option value="sale">For sale</option>
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
        <input name="photos" type="file" accept="image/*" multiple />
      </label>

      <h3 style={{margin:'0.5rem 0 0'}}>Your contact (shown on your live listing)</h3>
      <div className="row">
        <label>Name<input name="ownerName" required placeholder="Your name" /></label>
        <label>Phone<input name="ownerPhone" required placeholder="203-555-0100" /></label>
        <label>Email<input name="ownerEmail" type="email" required placeholder="you@email.com" /></label>
      </div>

      {error ? <div style={{color:'#b91c1c'}}>{error}</div> : null}
      <button className="btn big" type="submit" disabled={busy}>
        {busy ? 'Working…' : `Pay $${LISTING_FEE_USD} & publish`}
      </button>
      <p className="note">
        Photos and contact info are stored with your listing (browser storage in this demo).
        Production should use Stripe Checkout + cloud DB/photo storage.
      </p>
    </form>
  )
}
