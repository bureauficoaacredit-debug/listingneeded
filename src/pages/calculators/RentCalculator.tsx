import { useState } from 'react'
import { Link } from 'react-router-dom'
import BlogCta from '../../components/BlogCta'
import { usd } from '../../lib/ctAcs'
import { useSeo } from '../../lib/seo'
import { NumField, num } from './CalcField'

/** v68: how much rent can I afford (30% rule, landlords' 40x-income test, and a debt-aware 36% limit). */
export default function RentCalculator() {
  useSeo('Rent calculator: how much rent can I afford?', 'Estimate an affordable monthly rent from your income with the 30% rule, the 40x income test and your debts.')
  const [income, setIncome] = useState('85000')
  const [period, setPeriod] = useState<'year' | 'month'>('year')
  const [debts, setDebts] = useState('400')
  const [utilities, setUtilities] = useState('200')
  const [pct, setPct] = useState('30')

  const yearly = period === 'year' ? num(income) : num(income) * 12
  const monthly = yearly / 12
  const rule = (monthly * num(pct)) / 100
  const fortyX = yearly / 40
  const debtAware = Math.max(0, monthly * 0.36 - num(debts))
  const util = num(utilities)
  // 30% and debt limits cover rent + utilities; the landlord 40x test is rent alone
  const comfortable = Math.max(0, Math.min(rule - util, fortyX, debtAware - util))
  const stretch = Math.max(0, Math.max(rule - util, fortyX))

  return (
    <div className="calc-page">
      <p className="blog-kicker">Calculators</p>
      <h1>Rent Calculator</h1>
      <p className="meta">How much rent can you afford? Enter your income before taxes.</p>
      <div className="calc-grid">
        <div className="calc-form">
          <div className="calc-row">
            <NumField label="Gross income" prefix="$" value={income} onChange={setIncome} />
            <label className="calc-field">
              <span>Per</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value as 'year' | 'month')}>
                <option value="year">Year</option>
                <option value="month">Month</option>
              </select>
            </label>
          </div>
          <NumField label="Monthly debt payments" prefix="$" value={debts} onChange={setDebts} hint="Car, student loans, minimum card payments" />
          <NumField label="Utilities you'll pay" prefix="$" suffix="/mo" value={utilities} onChange={setUtilities} hint="Heat, electric, internet (0 if included)" />
          <NumField label="Share of income for housing" suffix="%" value={pct} onChange={setPct} step="1" hint="30% is the usual guideline" />
        </div>
        <div className="calc-result">
          <span>Comfortable rent</span>
          <strong>{usd(comfortable)}/mo</strong>
          {stretch > comfortable + 50 ? <small>Up to {usd(stretch)}/mo if you stretch</small> : <small>after {usd(util)}/mo utilities</small>}
          <ul>
            <li><b>{pct || 0}% rule:</b> {usd(rule)}/mo for rent + utilities</li>
            <li><b>40× income test</b> (many CT landlords): rent up to {usd(fortyX)}/mo</li>
            <li><b>With your debts</b> (36% of income for all debt + rent): {usd(debtAware)}/mo</li>
          </ul>
          <Link className="btn" to={`/browse?type=rent&max=${Math.round(comfortable)}`}>See rentals up to {usd(comfortable)}</Link>
        </div>
      </div>
      <p className="calc-note">An estimate for planning only, not financial advice. Landlords also look at credit, references and savings.</p>
      <BlogCta />
    </div>
  )
}
