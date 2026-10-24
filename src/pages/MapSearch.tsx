import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { supabaseFetch } from '../lib/supabase'
import { todayYmd } from '../lib/store'
import { useSeo } from '../lib/seo'

/**
 * v76: map search of OUR listings only (own page, /#/map). Whole US, opens on Connecticut; pins open our own listing
 * pages. Coordinates come from the site's server (Census geocoder, ZIP fallback), so other states show up on their own.
 */
type Pt = {
  id: string; type: 'rent' | 'sale' | 'short-term'; price: number; beds: number | null; baths: number | null
  lat: number; lng: number; address: string; city: string; state: string; cover_photo: string | null; geo_source: string | null; short_sale: boolean | null
}
const CT_BOUNDS: L.LatLngBoundsExpression = [[40.98, -73.73], [42.05, -71.79]]
const TYPES = [['all', 'All'], ['sale', 'For Sale'], ['rent', 'For Rent'], ['short-term', 'Short-term']] as const

async function loadPoints(): Promise<Pt[]> {
  const sel = 'id,type,price,beds,baths,lat,lng,address,city,state,cover_photo,geo_source,short_sale'
  const base = `/rest/v1/listings?live=eq.true&paid=eq.true&deleted_at=is.null&lat=not.is.null` +
    `&or=(active_until.is.null,active_until.gte.${todayYmd()})&order=id.asc&select=${sel}&limit=1000`
  const out: Pt[] = []
  for (let off = 0; off < 50000; off += 1000) {
    const res = await supabaseFetch(`${base}&offset=${off}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error('Could not load the map')
    const rows = (await res.json()) as Pt[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const priceLabel = (p: Pt) => (p.type === 'rent' ? `${money(p.price)}/mo` : p.type === 'short-term' ? `${money(p.price)}/night` : money(p.price))
const short = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`)
const toNum = (s: string) => { const n = Number(s.replace(/[^\d.]/g, '')); return s.trim() && Number.isFinite(n) ? n : null }

export default function MapSearch() {
  useSeo('Map search: homes for rent and sale | Listing Needed', 'Browse Listing Needed homes on a map: for sale, for rent and short-term stays. Tap a pin to see the home.')
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.MarkerClusterGroup | null>(null)
  const [pts, setPts] = useState<Pt[] | null>(null)
  const [err, setErr] = useState('')
  const [type, setType] = useState<(typeof TYPES)[number][0]>('all')
  const [minS, setMinS] = useState('')
  const [maxS, setMaxS] = useState('')
  const [sel, setSel] = useState<Pt | null>(null)
  const [ssOnly, setSsOnly] = useState(false)

  useEffect(() => { loadPoints().then(setPts, (e) => setErr(String(e.message || e))) }, [])

  useEffect(() => {
    if (!box.current || map.current) return
    const m = L.map(box.current, { minZoom: 3, maxBounds: [[5, -180], [75, -50]], worldCopyJump: false, zoomControl: true })
    m.fitBounds(CT_BOUNDS)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(m)
    layer.current = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, chunkedLoading: true })
    m.addLayer(layer.current)
    m.on('click', () => setSel(null))
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])

  const shown = useMemo(() => {
    const min = toNum(minS), max = toNum(maxS)
    return (pts || []).filter((p) => (type === 'all' || p.type === type) && (min == null || p.price >= min) && (max == null || p.price <= max) && (!ssOnly || !!p.short_sale))
  }, [pts, type, minS, maxS, ssOnly])

  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    g.addLayers(shown.map((p) => {
      const icon = L.divIcon({ className: '', html: `<span class="mapPin mapPin-${p.type}">${short(p.price)}</span>`, iconSize: undefined })
      const mk = L.marker([p.lat, p.lng], { icon, title: `${p.address}, ${p.city}` })
      mk.on('click', (e) => { L.DomEvent.stopPropagation(e); setSel(p) })
      return mk
    }))
  }, [shown])

  return (
    <div className="mapsearch">
      <div className="mapsearch-bar">
        <div className="mapsearch-types" role="tablist" aria-label="Type">
          {TYPES.map(([k, lab]) => (
            <button key={k} type="button" className={type === k ? 'on' : ''} aria-pressed={type === k} onClick={() => setType(k)}>{lab}</button>
          ))}
        </div>
        <input inputMode="numeric" placeholder="Min $" aria-label="Minimum price" value={minS} onChange={(e) => setMinS(e.target.value)} />
        <input inputMode="numeric" placeholder="Max $" aria-label="Maximum price" value={maxS} onChange={(e) => setMaxS(e.target.value)} />
        <label className="search-ss-toggle"><input type="checkbox" checked={ssOnly} onChange={(e) => setSsOnly(e.target.checked)} /> Short sales</label>
        <span className="mapsearch-count">{pts ? `${shown.length.toLocaleString()} homes` : err || 'Loading…'}</span>
        <Link className="mapsearch-list" to="/browse">List view</Link>
      </div>
      <div className="mapsearch-map" ref={box} />
      {sel ? (
        <div className="mapsearch-card" role="dialog" aria-label="Selected home">
          <button type="button" className="mapsearch-x" aria-label="Close" onClick={() => setSel(null)}>×</button>
          <Link to={`/listing/${encodeURIComponent(sel.id)}`} className="mapsearch-card-link">
            {sel.cover_photo ? <img src={sel.cover_photo} alt="" loading="lazy" /> : <div className="mapsearch-nophoto">No photo</div>}
            <div>
              <div className="mapsearch-price">{priceLabel(sel)}{sel.short_sale ? <span className="badge short-sale" style={{ marginLeft: 8, verticalAlign: 'middle' }}>Short sale</span> : null}</div>
              <div className="mapsearch-meta">{[sel.beds != null ? `${sel.beds} bd` : '', sel.baths != null ? `${sel.baths} ba` : '', sel.type === 'sale' ? 'For sale' : sel.type === 'rent' ? 'For rent' : 'Short-term'].filter(Boolean).join(' · ')}</div>
              <div className="mapsearch-addr">{sel.address}, {sel.city}, {sel.state}</div>
              {sel.geo_source === 'zip' ? <div className="mapsearch-approx">Pin shows the ZIP area</div> : null}
              <span className="mapsearch-view">View home ›</span>
            </div>
          </Link>
        </div>
      ) : null}
    </div>
  )
}
