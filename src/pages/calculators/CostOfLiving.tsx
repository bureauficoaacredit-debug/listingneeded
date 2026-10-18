import { useMemo, useState } from 'react'
import BlogCta from '../../components/BlogCta'
import { ACS_RELEASE, ctTowns, usd } from '../../lib/ctAcs'
import { useSeo } from '../../lib/seo'
import { NumField, num } from './CalcField'

/**
 * v68: simple cost-of-living comparison between two CT towns. Only housing is scaled (by the Census median rent or home
 * value ratio); other costs are kept the same, because we don't have honest town-level data for them.
 */
export default function CostOfLiving() {
  useSeo('Cost of living calculator: compare Connecticut towns', 'Compare monthly housing costs between two Connecticut towns using Census median rents and home values.')
  const towns = ctTowns()
  const [from, setFrom] = useState('Fairfield')
  const [to, setTo] = useState('Stamford')
  const [mode, setMode] = useState<'rent' | 'own'>('rent')
  const [housing, setHousing] = useState('2400')
  const [other, setOther] = useState('2500')
  const a = towns.find((t) => t.town === from)
  const b = towns.find((t) => t.town === to)

  const r = useMemo(() => {
    const key = mode === 'rent' ? 'medianRent' : 'medianValue'
    const av = a?.[key], bv = b?.[key]
    const ratio = av && bv ? bv / av : null
    const newHousing = ratio ? num(housing) * ratio : null
    const total1 = num(housing) + num(other)
    const total2 = newHousing != null ? newHousing + num(other) : null
    return { ratio, newHousing, total1, total2, diff: total2 != null ? total2 - total1 : null }
  }, [a, b, mode, housing, other])

  const select = (v: string, set: (s: string) => void, label: string) => (
    <label className="calc-field">
      <span>{label}</span>
      <select value={v} onChange={(e) => set(e.target.value)}>
        {towns.map((t) => <option key={t.town} value={t.town}>{t.town}</option>)}
      </select>
    </label>
  )

  return (
    <div className="calc-page">
      <p className="blog-kicker">Calculators</p>
      <h1>Cost of Living Calculator</h1>
      <p className="meta">Moving within Connecticut? See how your monthly budget changes between two towns.</p>
      <div className="calc-grid">
        <div className="calc-form">
          <div className="calc-row">{select(from, setFrom, 'I live in')}{select(to, setTo, 'Moving to')}</div>
          <label className="calc-field">
            <span>I</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'rent' | 'own')}>
              <option value="rent">Rent</option>
              <option value="own">Own (mortgage, taxes, insurance)</option>
            </select>
          </label>
          <NumField label="My monthly housing cost now" prefix="$" value={housing} onChange={setHousing} />
          <NumField label="Everything else per month" prefix="$" value={other} onChange={setOther} hint="Food, car, childcare, utilities… kept the same" />
        </div>
        <div className="calc-result">
          <span>Estimated budget in {to}</span>
          <strong>{r.total2 != null ? `${usd(r.total2)}/mo` : '—'}</strong>
          <small>
            {r.diff != null ? `${r.diff >= 0 ? usd(r.diff) + ' more' : usd(-r.diff) + ' less'} than ${usd(r.total1)}/mo in ${from}` : 'Pick two towns'}
          </small>
          <ul>
            <li><b>Housing:</b> {usd(num(housing))} → {usd(r.newHousing)} /mo{r.ratio ? ` (${r.ratio >= 1 ? '+' : ''}${Math.round((r.ratio - 1) * 100)}%)` : ''}</li>
            <li><b>Median rent:</b> {from} {usd(a?.medianRent)} · {to} {usd(b?.medianRent)}</li>
            <li><b>Median home value:</b> {from} {usd(a?.medianValue)} · {to} {usd(b?.medianValue)}</li>
            <li><b>Median household income:</b> {from} {usd(a?.medianIncome)} · {to} {usd(b?.medianIncome)}</li>
          </ul>
        </div>
      </div>
      <p className="calc-note">
        Estimate: only housing is adjusted, by the ratio of each town's Census median {mode === 'rent' ? 'gross rent' : 'home value'} ({ACS_RELEASE};
        town figures combine the town's ZIPs). Other costs are assumed equal. Information from public records.
      </p>
      <BlogCta />
    </div>
  )
}
