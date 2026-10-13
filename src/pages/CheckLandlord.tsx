import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

/** CT towns whose Vision Government Solutions assessor database was verified live (gis.vgsi.com/<slug>ct/Search.aspx). */
const VISION_TOWNS: Record<string, string> = {
  bridgeport: 'bridgeportct', brookfield: 'brookfieldct', fairfield: 'fairfieldct', milford: 'milfordct',
  monroe: 'monroect', 'new fairfield': 'newfairfieldct', 'new haven': 'newhavenct', newtown: 'newtownct',
  redding: 'reddingct', stamford: 'stamfordct', stratford: 'stratfordct', trumbull: 'trumbullct',
  westport: 'westportct', orange: 'orangect', hamden: 'hamdenct', branford: 'branfordct', madison: 'madisonct',
  wallingford: 'wallingfordct', meriden: 'meridenct', southbury: 'southburyct', middlebury: 'middleburyct',
  'new britain': 'newbritainct', bristol: 'bristolct', manchester: 'manchesterct', middletown: 'middletownct',
  'new london': 'newlondonct', norwich: 'norwichct', glastonbury: 'glastonburyct', enfield: 'enfieldct',
  wolcott: 'wolcottct',
}

const TOWNS = [
  'Ansonia', 'Bethel', 'Branford', 'Bridgeport', 'Bristol', 'Brookfield', 'Cheshire', 'Danbury', 'Darien', 'Derby',
  'East Haven', 'Easton', 'Enfield', 'Fairfield', 'Glastonbury', 'Greenwich', 'Groton', 'Guilford', 'Hamden', 'Hartford',
  'Madison', 'Manchester', 'Meriden', 'Middlebury', 'Middletown', 'Milford', 'Monroe', 'Naugatuck', 'New Britain',
  'New Canaan', 'New Fairfield', 'New Haven', 'New London', 'Newtown', 'North Haven', 'Norwalk', 'Norwich', 'Orange',
  'Oxford', 'Redding', 'Ridgefield', 'Seymour', 'Shelton', 'Southbury', 'Stamford', 'Stratford', 'Torrington',
  'Trumbull', 'Wallingford', 'Waterbury', 'West Hartford', 'West Haven', 'Weston', 'Westport', 'Wilton', 'Wolcott',
  'Woodbridge',
]

const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`

type LinkItem = { title: string; why: string; href: string; tip?: string }

function buildLinks(street: string, town: string): LinkItem[] {
  const t = town.trim()
  const slug = VISION_TOWNS[t.toLowerCase()]
  const items: LinkItem[] = []
  items.push(
    slug
      ? {
          title: `${t} assessor — property card`,
          why: 'Owner of record, sale history and assessed value. Search by street address.',
          href: `https://gis.vgsi.com/${slug}/Search.aspx`,
          tip: street ? `Search for “${street}”.` : undefined,
        }
      : {
          title: `${t || 'Town'} assessor online database`,
          why: 'Find the town’s property-card lookup to see the owner of record.',
          href: google(`${t} CT assessor online database`),
        },
  )
  items.push({
    title: 'CT Judicial — foreclosures & lis pendens (property search)',
    why: 'Search the property address for foreclosure and other civil cases tied to the home.',
    href: 'https://civilinquiry.jud.ct.gov/PropertySearch.aspx',
    tip: street ? `Enter “${street}” and the town.` : undefined,
  })
  items.push({
    title: 'CT Judicial — evictions / housing cases (party search)',
    why: 'Search the owner’s name for Housing (Summary Process / eviction) and civil cases.',
    href: 'https://civilinquiry.jud.ct.gov/PartySearch.aspx',
  })
  items.push({
    title: `${t || 'Town'} land records`,
    why: 'Deeds and mortgages: confirm who really owns the home.',
    href: 'https://www.uslandrecords.com/ctlr/',
    tip: 'Many CT town clerks are on this portal; if your town isn’t listed, use the town clerk link below.',
  })
  items.push({
    title: `${t || 'Town'} town clerk land records search`,
    why: 'Town clerk’s own land-records search for towns not on the portal above.',
    href: google(`${t} CT town clerk land records search`),
  })
  items.push({
    title: 'CT business registry (if the owner is an LLC)',
    why: 'See who is behind an LLC landlord and whether it is in good standing.',
    href: 'https://service.ct.gov/business/s/onlinebusinesssearch',
  })
  return items
}

export default function CheckLandlord() {
  const [params, setParams] = useSearchParams()
  const [street, setStreet] = useState(params.get('address') ?? '')
  const [town, setTown] = useState(params.get('town') ?? '')
  const [done, setDone] = useState(Boolean(params.get('address') && params.get('town') && params.get('go') === '1'))
  const applied = { street: params.get('address') ?? street, town: params.get('town') ?? town }
  const links = useMemo(() => buildLinks(applied.street, applied.town), [applied.street, applied.town])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!town.trim()) return
    setParams({ address: street.trim(), town: town.trim(), go: '1' }, { replace: true })
    setDone(true)
    requestAnimationFrame(() => document.getElementById('landlord-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="landlord">
      <section className="landlord-hero">
        <h1>Check your Landlord</h1>
        <p className="landlord-pitch">The only site that checks the landlord, not just the tenant.</p>
        <p className="meta">Before you sign or pay, see who owns the home and whether it’s in foreclosure — free public records, Connecticut.</p>
      </section>

      <form className="landlord-form card" onSubmit={submit}>
        <div className="body">
          <label>
            Street address
            <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="e.g. 21 Ardmore St" autoComplete="street-address" />
          </label>
          <label>
            Town (CT)
            <input
              value={town}
              onChange={(e) => setTown(e.target.value)}
              placeholder="e.g. Fairfield"
              list="ct-towns"
              required
              autoComplete="address-level2"
            />
            <datalist id="ct-towns">
              {TOWNS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <button type="submit" className="btn">
            Check this landlord
          </button>
        </div>
      </form>

      {done && applied.town ? (
        <section id="landlord-results" className="landlord-results">
          <h2>
            Public records for {applied.street ? `${applied.street}, ` : ''}
            {applied.town}, CT
          </h2>
          <p className="meta landlord-source">Information from public records.</p>
          <ol className="landlord-links">
            {links.map((l) => (
              <li key={l.title} className="card">
                <a href={l.href} target="_blank" rel="noopener noreferrer">
                  <strong>{l.title} ↗</strong>
                  <span>{l.why}</span>
                  {l.tip ? <em>{l.tip}</em> : null}
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="landlord-tips card">
        <div className="body">
          <h2>Rental scam tips</h2>
          <ul>
            <li><strong>Never wire money</strong>, send gift cards, crypto or Zelle to someone you haven’t met.</li>
            <li><strong>Verify the owner’s name matches the lease</strong> (and the assessor’s owner of record). If a manager signs, ask for written authority.</li>
            <li><strong>See inside before paying</strong> anything — no “I’m out of the country, I’ll mail the keys.”</li>
            <li>Be wary of rent far below the area, pressure to decide today, or a listing copied from a for-sale ad.</li>
          </ul>
        </div>
      </section>

      <section className="landlord-contact">
        <strong>Questions? Marcel Najar</strong>
        <div>
          <a href="https://www.listingneeded.com">www.listingneeded.com</a> · <a href="tel:2038183242">203-818-3242</a>
        </div>
      </section>
    </div>
  )
}
