/** v69: the last town / ZIP searched (drives the menu's "Average rent in <town>" link). Default Fairfield 06825. */
export type LastTown = { town: string; zip?: string }
const KEY = 'ln_last_town'
const DEFAULT: LastTown = { town: 'Fairfield', zip: '06825' }
const subs = new Set<() => void>()
let cache: LastTown | null = null

export function getLastTown(): LastTown {
  if (cache) return cache
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (v && typeof v.town === 'string' && v.town) cache = { town: v.town.slice(0, 60), zip: /^06\d{3}$/.test(v.zip) ? v.zip : undefined }
  } catch {
    /* private mode */
  }
  return (cache ??= DEFAULT)
}

export function setLastTown(t: LastTown) {
  const cur = getLastTown()
  if (cur.town === t.town && cur.zip === t.zip) return
  cache = t
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f())
}

export function subscribeLastTown(f: () => void) {
  subs.add(f)
  return () => void subs.delete(f)
}

export function averageRentHref(t: LastTown) {
  return t.zip ? `/average-rent?zip=${t.zip}` : `/average-rent?town=${encodeURIComponent(t.town)}`
}
