/** v75: "Add to Home Screen" support. Android/Chrome: beforeinstallprompt. iPhone/iPad: instructions sheet. */
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: BIP | null = null
let installed = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
export const DISMISS_KEY = 'ln_a2hs_dismissed'

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BIP
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
  }
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return installed || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}
export function isIos() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}
export function isPhone() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || isIos()
}
/** Show the button: phones only, not already installed, and either native prompt ready or iOS. */
export function canOffer() {
  return isPhone() && !isStandalone() && (!!deferred || isIos())
}
export function subscribe(f: () => void) {
  subs.add(f)
  return () => subs.delete(f)
}
export function snapshot() {
  return `${canOffer()}`
}
/** Returns 'native' if Chrome's own install dialog was shown, 'ios' if the caller should show the instructions. */
export async function install(): Promise<'native' | 'ios' | 'none'> {
  if (deferred) {
    const d = deferred
    deferred = null
    await d.prompt()
    await d.userChoice.catch(() => null)
    emit()
    return 'native'
  }
  return isIos() ? 'ios' : 'none'
}
export function isDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}
export function dismiss() {
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  emit()
}
