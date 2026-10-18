import type { Listing } from './types'

/** v68/v69: asking-rent math shared by the Average Rent page and the Search panel (tiny; no Census data here). */
export const RENT_BEDS = [
  { label: 'Studio', test: (b: number) => b === 0 },
  { label: '1 bedroom', test: (b: number) => b === 1 },
  { label: '2 bedrooms', test: (b: number) => b === 2 },
  { label: '3 bedrooms', test: (b: number) => b === 3 },
  { label: '4+ bedrooms', test: (b: number) => b >= 4 },
]

export function medianOf(xs: number[]) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function rentStats(rows: Listing[]) {
  // ignore obvious data-entry errors (e.g. a sale price typed into a rental)
  const prices = rows.map((l) => l.price).filter((p) => p >= 300 && p <= 40000)
  return {
    n: prices.length,
    median: medianOf(prices),
    avg: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
    min: prices.length ? Math.min(...prices) : null,
    max: prices.length ? Math.max(...prices) : null,
  }
}

export function rentByBeds(rows: Listing[]) {
  return RENT_BEDS.map((b) => ({ label: b.label, ...rentStats(rows.filter((l) => b.test(Math.round(l.beds)))) }))
}

export const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : `$${Math.round(n).toLocaleString('en-US')}`
