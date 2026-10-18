import acs from '../data/ctAcs.json'

/** v68: bundled Census ACS figures for Connecticut ZIPs (lazy pages only), aggregated to towns. */
type Row = [string | null, number | null, number | null, number | null, number | null, number | null]
const ZIPS = (acs as unknown as { zips: Record<string, Row> }).zips
export const ACS_RELEASE = (acs as unknown as { release: string }).release
export const ACS_SOURCE = (acs as unknown as { source: string }).source

export type ZipFacts = { zip: string; town: string | null; medianIncome: number | null; medianValue: number | null; medianRent: number | null }
export function zipFacts(zip: string): ZipFacts | null {
  const r = ZIPS[zip]
  if (!r) return null
  return { zip, town: r[0], medianIncome: r[1], medianValue: r[2], medianRent: r[3] }
}

export type TownFacts = { town: string; zips: string[]; medianRent: number | null; medianValue: number | null; medianIncome: number | null }
/** Town figure = each ZIP's Census median weighted by its renter (rent) / owner (value) / all (income) homes: an estimate. */
function buildTowns(): TownFacts[] {
  const acc = new Map<string, { zips: string[]; r: [number, number]; v: [number, number]; i: [number, number] }>()
  for (const [zip, [town, inc, val, rent, owners, renters]] of Object.entries(ZIPS)) {
    if (!town) continue
    const a = acc.get(town) ?? { zips: [], r: [0, 0], v: [0, 0], i: [0, 0] }
    a.zips.push(zip)
    if (rent && renters) { a.r[0] += rent * renters; a.r[1] += renters }
    if (val && owners) { a.v[0] += val * owners; a.v[1] += owners }
    const hh = (owners ?? 0) + (renters ?? 0)
    if (inc && hh) { a.i[0] += inc * hh; a.i[1] += hh }
    acc.set(town, a)
  }
  return [...acc.entries()]
    .map(([town, a]) => ({
      town,
      zips: a.zips.sort(),
      medianRent: a.r[1] ? Math.round(a.r[0] / a.r[1]) : null,
      medianValue: a.v[1] ? Math.round(a.v[0] / a.v[1] / 100) * 100 : null,
      medianIncome: a.i[1] ? Math.round(a.i[0] / a.i[1] / 100) * 100 : null,
    }))
    .sort((x, y) => x.town.localeCompare(y.town))
}
let towns: TownFacts[] | null = null
export function ctTowns() {
  return (towns ??= buildTowns())
}
export function townFacts(name: string) {
  const n = name.trim().toLowerCase()
  return ctTowns().find((t) => t.town.toLowerCase() === n) ?? null
}

export const usd = (n: number | null | undefined, digits = 0) =>
  n == null || !Number.isFinite(n) ? '—' : `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`

export function median(xs: number[]) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
