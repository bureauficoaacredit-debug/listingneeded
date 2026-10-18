import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import BlogCta from '../../components/BlogCta'
import { usd } from '../../lib/ctAcs'
import { useSeo } from '../../lib/seo'
import { NumField, num } from './CalcField'

type In = Record<string, number>
/**
 * v68: month-by-month comparison. The buyer pays mortgage + taxes + insurance + HOA + upkeep; the renter pays rent +
 * renter's insurance and invests the down payment and closing costs. Whoever pays less each month invests the
 * difference. Result = what each side owns after N years (home equity after selling costs + investments).
 */
function simulate(v: In) {
  const price = v.price
  const down = (price * v.downPct) / 100
  const loan = Math.max(0, price - down)
  const r = v.rate / 100 / 12
  const n = Math.max(1, v.term * 12)
  const pmt = loan ? (r ? (loan * r) / (1 - Math.pow(1 + r, -n)) : loan / n) : 0
  const inv = v.invest / 100 / 12
  let bal = loan
  let value = price
  let renterPort = down + (price * v.closingPct) / 100
  let buyerPort = 0
  let buyPaid = 0
  let rentPaid = 0
  const years: { year: number; buyer: number; renter: number }[] = []
  let first = { buy: 0, rent: 0, pi: pmt, tax: 0, ins: 0, hoa: 0, upkeep: 0 }
  for (let m = 1; m <= 30 * 12; m++) {
    const y = Math.floor((m - 1) / 12)
    const grow = Math.pow(1 + v.appreciation / 100, y)
    const interest = bal * r
    const principal = m <= n ? Math.min(bal, pmt - interest) : 0
    bal = Math.max(0, bal - principal)
    const tax = (v.taxes * grow) / 12
    const ins = (v.insurance * grow) / 12
    const hoa = v.hoa * Math.pow(1.03, y)
    const upkeep = (value * v.maintPct) / 100 / 12
    const buy = (m <= n ? pmt : 0) + tax + ins + hoa + upkeep
    const rent = v.rent * Math.pow(1 + v.rentGrowth / 100, y) + v.rentersIns / 12
    if (m === 1) first = { buy, rent, pi: pmt, tax, ins, hoa, upkeep }
    buyPaid += buy
    rentPaid += rent
    renterPort = renterPort * (1 + inv) + Math.max(0, buy - rent)
    buyerPort = buyerPort * (1 + inv) + Math.max(0, rent - buy)
    value *= Math.pow(1 + v.appreciation / 100, 1 / 12)
    if (m % 12 === 0) {
      const equity = value * (1 - v.sellPct / 100) - bal
      years.push({ year: m / 12, buyer: equity + buyerPort, renter: renterPort })
    }
  }
  const at = years[Math.min(29, Math.max(0, Math.round(v.years) - 1))]
  const breakeven = years.find((x) => x.buyer > x.renter)?.year ?? null
  return { first, at, breakeven, down, loan, pmt, buyPaid, rentPaid }
}

const FIELDS: [string, string, string, string?, string?][] = [
  // key, label, default, prefix, suffix
  ['price', 'Home price', '500000', '$'],
  ['downPct', 'Down payment', '20', '', '%'],
  ['rate', 'Mortgage rate', '6.5', '', '%'],
  ['term', 'Loan term', '30', '', 'yrs'],
  ['taxes', 'Property taxes', '10000', '$', '/yr'],
  ['hoa', 'HOA / common charges', '0', '$', '/mo'],
  ['insurance', 'Home insurance', '1800', '$', '/yr'],
  ['maintPct', 'Upkeep', '1', '', '% of value/yr'],
  ['appreciation', 'Home value growth', '3', '', '%/yr'],
  ['closingPct', 'Closing costs (buying)', '3', '', '%'],
  ['sellPct', 'Selling costs', '6', '', '%'],
  ['rent', 'Rent for a similar home', '3000', '$', '/mo'],
  ['rentGrowth', 'Rent increase', '3', '', '%/yr'],
  ['rentersIns', "Renter's insurance", '200', '$', '/yr'],
  ['invest', 'Return on savings', '5', '', '%/yr'],
  ['years', 'Compare over', '7', '', 'years'],
]

export default function RentVsBuy() {
  useSeo('Rent vs. buy calculator (Connecticut)', 'Compare buying a home (mortgage, property taxes, HOA, insurance) with renting over the years you plan to stay.')
  const [sp] = useSearchParams()
  const [f, setF] = useState<Record<string, string>>(() => {
    const init = Object.fromEntries(FIELDS.map(([k, , d]) => [k, d]))
    for (const k of ['price', 'taxes', 'hoa', 'rent']) {
      const q = sp.get(k)
      if (q && Number(q) >= 0) init[k] = String(Math.round(Number(q)))
    }
    return init
  })
  const v = useMemo(() => Object.fromEntries(Object.entries(f).map(([k, s]) => [k, num(s)])) as In, [f])
  const r = useMemo(() => simulate(v), [v])
  const diff = r.at.buyer - r.at.renter
  const yrs = Math.min(30, Math.max(1, Math.round(v.years)))

  return (
    <div className="calc-page">
      <p className="blog-kicker">Calculators</p>
      <h1>Rent vs. Buy Calculator</h1>
      <p className="meta">Buying includes mortgage, property taxes, HOA, insurance and upkeep; renting includes rent increases. Change any number.</p>
      <div className="calc-grid">
        <div className="calc-form calc-form--2col">
          {FIELDS.map(([k, label, , pre, suf]) => (
            <NumField key={k} label={label} prefix={pre || undefined} suffix={suf} value={f[k]} onChange={(s) => setF((x) => ({ ...x, [k]: s }))} />
          ))}
        </div>
        <div className="calc-result">
          <span>After {yrs} year{yrs === 1 ? '' : 's'}</span>
          <strong>{diff >= 0 ? 'Buying' : 'Renting'} comes out {usd(Math.abs(diff))} ahead</strong>
          <small>{r.breakeven ? `Buying pulls ahead after about ${r.breakeven} year${r.breakeven === 1 ? '' : 's'}` : 'Renting stays ahead for 30 years with these numbers'}</small>
          <ul>
            <li><b>Buying, first month:</b> {usd(r.first.buy)}/mo (mortgage {usd(r.first.pi)} · taxes {usd(r.first.tax)} · insurance {usd(r.first.ins)}{r.first.hoa ? ` · HOA ${usd(r.first.hoa)}` : ''} · upkeep {usd(r.first.upkeep)})</li>
            <li><b>Renting, first month:</b> {usd(r.first.rent)}/mo</li>
            <li><b>Cash to buy:</b> {usd(r.down)} down + {usd((v.price * v.closingPct) / 100)} closing; loan {usd(r.loan)}</li>
            <li><b>What you'd have after {yrs} yrs:</b> buyer {usd(r.at.buyer)} (home equity after selling costs + savings) · renter {usd(r.at.renter)} (invested savings)</li>
          </ul>
        </div>
      </div>
      <p className="calc-note">
        An estimate with simple assumptions (taxes and insurance grow with home value, HOA 3%/yr, no tax deductions or PMI). Not financial
        advice. For a real number, ask a lender, and use the home's actual Annual taxes and HOA from its Listing Needed page.
      </p>
      <BlogCta />
    </div>
  )
}
