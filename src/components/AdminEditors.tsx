import { useState, type FormEvent } from 'react'
import { Modal } from './AdminModal'
import { updateListing, updatePartnerLink } from '../lib/store'
import type { HoaFrequency, Listing, ListingType, PartnerCategory, PartnerLink } from '../lib/types'
import { HOA_FREQUENCIES, PARTNER_CATEGORY_LABELS, stayLinkSite } from '../lib/types'

/** Admin: edit every field of one listing (MLS or DIY). */
export function ListingEditModal({
  listing,
  onClose,
  onSaved,
}: {
  listing: Listing
  onClose: () => void
  onSaved: (l: Listing) => void
}) {
  const [f, setF] = useState({
    type: listing.type,
    address: listing.address,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
    price: String(listing.price ?? ''),
    beds: String(listing.beds ?? ''),
    baths: String(listing.baths ?? ''),
    sqft: String(listing.sqft ?? ''),
    yearBuilt: String(listing.yearBuilt ?? ''),
    taxesAnnual: String(listing.taxesAnnual ?? ''),
    taxYear: String(listing.taxYear ?? ''),
    hoaFee: String(listing.hoaFee ?? ''),
    hoaFrequency: (listing.hoaFrequency ?? 'month') as HoaFrequency,
    pets: listing.pets,
    minNights: String(listing.minNights ?? ''),
    maxGuests: String(listing.maxGuests ?? ''),
    alsoOnOtherSites: !!listing.alsoOnOtherSites,
    externalListingUrl: listing.externalListingUrl ?? '',
    description: listing.description ?? '',
    ownerName: listing.ownerName ?? '',
    ownerPhone: listing.ownerPhone ?? '',
    ownerEmail: listing.ownerEmail ?? '',
    activeUntil: listing.activeUntil?.slice(0, 10) ?? '',
    live: listing.live,
    paid: listing.paid,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!f.address.trim() || !f.city.trim()) return setError('Address and city are required.')
    const price = Number(f.price)
    if (!Number.isFinite(price) || price < 0) return setError('Enter a valid price.')
    if (f.type === 'short-term' && f.externalListingUrl.trim() && !stayLinkSite(f.externalListingUrl)) return setError('Airbnb / VRBO link must be https:// on airbnb.com or vrbo.com.')
    setSaving(true)
    setError('')
    try {
      const updated = await updateListing(listing.id, {
        type: f.type,
        address: f.address.trim(),
        city: f.city.trim(),
        state: f.state.trim().toUpperCase().slice(0, 2),
        zip: f.zip.trim(),
        price,
        beds: Number(f.beds) || 0,
        baths: Number(f.baths) || 0,
        sqft: Number(f.sqft) || null,
        yearBuilt: Number(f.yearBuilt) || null,
        // v67: empty box = remove (row hidden on the home page)
        taxesAnnual: Number(f.taxesAnnual) > 0 ? Number(f.taxesAnnual) : null,
        taxYear: Number(f.taxesAnnual) > 0 && Number(f.taxYear) >= 1990 && Number(f.taxYear) <= 2100 ? Number(f.taxYear) : null,
        hoaFee: Number(f.hoaFee) > 0 ? Number(f.hoaFee) : null,
        hoaFrequency: Number(f.hoaFee) > 0 ? f.hoaFrequency : null,
        pets: f.pets,
        // v73 short-term fields (blank = not set)
        minNights: f.type === 'short-term' && Number(f.minNights) >= 1 ? Math.min(365, Math.round(Number(f.minNights))) : null,
        maxGuests: f.type === 'short-term' && Number(f.maxGuests) >= 1 ? Math.min(50, Math.round(Number(f.maxGuests))) : null,
        alsoOnOtherSites: f.type === 'short-term' ? f.alsoOnOtherSites : null,
        externalListingUrl: f.type === 'short-term' && f.externalListingUrl.trim() ? f.externalListingUrl.trim() : null,
        description: f.description,
        ownerName: f.ownerName.trim(),
        ownerPhone: f.ownerPhone.trim(),
        ownerEmail: f.ownerEmail.trim(),
        activeUntil: f.activeUntil || null,
        live: f.live,
        paid: f.paid,
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Edit listing — ${listing.address}`} onClose={onClose} wide>
      <form className="modal-body" onSubmit={save}>
        <div className="row">
          <label>
            Type
            <select value={f.type} onChange={(e) => setF((p) => ({ ...p, type: e.target.value as ListingType }))}>
              <option value="sale">sale</option>
              <option value="rent">rent</option>
              <option value="short-term">short-term stay</option>
            </select>
          </label>
          <label>
            {f.type === 'short-term' ? 'Price per night ($)' : 'Price'}
            <input type="number" value={f.price} onChange={set('price')} />
          </label>
          <label>
            Beds
            <input type="number" value={f.beds} onChange={set('beds')} />
          </label>
          <label>
            Baths
            <input type="number" step={0.5} value={f.baths} onChange={set('baths')} />
          </label>
          <label>
            Sq ft
            <input type="number" value={f.sqft} onChange={set('sqft')} />
          </label>
          <label>
            Year built
            <input type="number" value={f.yearBuilt} onChange={set('yearBuilt')} />
          </label>
        </div>
        <div className="row">
          <label>
            Annual taxes ($)
            <input type="number" step="any" value={f.taxesAnnual} onChange={set('taxesAnnual')} placeholder="empty = hide" />
          </label>
          <label>
            Tax year
            <input type="number" value={f.taxYear} onChange={set('taxYear')} />
          </label>
          <label>
            HOA / common charges ($)
            <input type="number" step="any" value={f.hoaFee} onChange={set('hoaFee')} placeholder="empty = hide" />
          </label>
          <label>
            HOA paid
            <select value={f.hoaFrequency} onChange={set('hoaFrequency')}>
              {HOA_FREQUENCIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
        </div>
        <label>
          Address
          <input value={f.address} onChange={set('address')} />
        </label>
        <div className="row">
          <label>
            City
            <input value={f.city} onChange={set('city')} />
          </label>
          <label>
            State
            <input value={f.state} maxLength={2} onChange={set('state')} />
          </label>
          <label>
            ZIP
            <input value={f.zip} onChange={set('zip')} />
          </label>
          <label>
            Pets
            <select value={f.pets} onChange={(e) => setF((p) => ({ ...p, pets: e.target.value as Listing['pets'] }))}>
              <option value="no">no</option>
              <option value="yes">yes</option>
              <option value="negotiable">negotiable</option>
            </select>
          </label>
        </div>
        {f.type === 'short-term' ? (
          <div className="row">
            <label>
              Min nights
              <input type="number" min={1} max={365} value={f.minNights} onChange={set('minNights')} placeholder="optional" />
            </label>
            <label>
              Max guests
              <input type="number" min={1} max={50} value={f.maxGuests} onChange={set('maxGuests')} placeholder="optional" />
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: '.4rem' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={f.alsoOnOtherSites} onChange={(e) => setF((p) => ({ ...p, alsoOnOtherSites: e.target.checked }))} />
              Host says also on Airbnb/VRBO (admin only)
            </label>
          </div>
        ) : null}
        {f.type === 'short-term' ? (
          <label>
            Host's Airbnb / VRBO link (shown as “View on …” button)
            <input type="url" maxLength={500} value={f.externalListingUrl} onChange={set('externalListingUrl')} placeholder="https://www.airbnb.com/rooms/… (empty = none)" />
          </label>
        ) : null}
        <label>
          Description
          <textarea rows={4} value={f.description} onChange={set('description')} />
        </label>
        <div className="row">
          <label>
            Owner name
            <input value={f.ownerName} onChange={set('ownerName')} />
          </label>
          <label>
            Owner phone
            <input value={f.ownerPhone} onChange={set('ownerPhone')} />
          </label>
          <label>
            Owner email
            <input value={f.ownerEmail} onChange={set('ownerEmail')} />
          </label>
        </div>
        <div className="row">
          <label>
            End date
            <input type="date" value={f.activeUntil} onChange={set('activeUntil')} />
          </label>
          <label className="check-label">
            <input type="checkbox" checked={f.live} onChange={(e) => setF((p) => ({ ...p, live: e.target.checked }))} />
            Live
          </label>
          <label className="check-label">
            <input type="checkbox" checked={f.paid} onChange={(e) => setF((p) => ({ ...p, paid: e.target.checked }))} />
            Paid
          </label>
        </div>
        {error ? <div style={{ color: '#b91c1c', fontSize: '.92rem' }}>{error}</div> : null}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save listing'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Admin: edit one partner link. */
export function PartnerEditModal({
  link,
  onClose,
  onSaved,
}: {
  link: PartnerLink
  onClose: () => void
  onSaved: (l: PartnerLink) => void
}) {
  const [f, setF] = useState({
    title: link.title,
    url: link.url,
    category: link.category,
    blurb: link.blurb,
    sortOrder: String(link.sortOrder),
    enabled: link.enabled,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!f.title.trim() || !f.url.trim()) return setError('Title and URL are required.')
    setSaving(true)
    setError('')
    try {
      onSaved(
        await updatePartnerLink(link.id, {
          title: f.title,
          url: f.url,
          category: f.category,
          blurb: f.blurb,
          sortOrder: Number(f.sortOrder) || 0,
          enabled: f.enabled,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Edit partner link — ${link.title}`} onClose={onClose}>
      <form className="modal-body" onSubmit={save}>
        <label>
          Title
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </label>
        <label>
          URL
          <input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
        </label>
        <div className="row">
          <label>
            Category
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PartnerCategory })}>
              {(Object.keys(PARTNER_CATEGORY_LABELS) as PartnerCategory[]).map((c) => (
                <option key={c} value={c}>
                  {PARTNER_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Order
            <input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
          </label>
          <label className="check-label">
            <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
            Visible
          </label>
        </div>
        <label>
          Blurb
          <textarea rows={3} value={f.blurb} onChange={(e) => setF({ ...f, blurb: e.target.value })} />
        </label>
        {error ? <div style={{ color: '#b91c1c', fontSize: '.92rem' }}>{error}</div> : null}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save link'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
