import { useSyncExternalStore } from 'react'
import { getConfig, setAccessTokenProvider } from './supabase'

/**
 * v49 admin login — Supabase Auth (email + password) over plain fetch, same style as supabase.ts.
 * The session (access + refresh token) lives in localStorage like supabase-js does; every Supabase request then carries
 * the admin's JWT, and the database (RLS + RPC checks on auth.uid()) decides what is allowed.
 */
export const ADMIN_EMAIL = 'bureauficoaacredit@gmail.com'
const KEY = 'listingneeded_admin_session'
const RECOVERY_KEY = 'listingneeded_recovery'

export type Session = { access_token: string; refresh_token: string; expires_at: number; email: string }

let session: Session | null = read()
const listeners = new Set<() => void>()

function read(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Session | null
    return s && s.access_token && s.refresh_token ? s : null
  } catch {
    return null
  }
}

function write(next: Session | null) {
  session = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: memory only */
  }
  listeners.forEach((l) => l())
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; user?: { email?: string } }

function toSession(d: TokenResponse, fallbackEmail = ''): Session {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (Number(d.expires_in) || 3600),
    email: d.user?.email || fallbackEmail,
  }
}

async function authFetch(path: string, init: RequestInit & { bearer?: string } = {}) {
  const { url, anonKey } = getConfig()
  const headers = new Headers({ apikey: anonKey, 'Content-Type': 'application/json' })
  if (init.bearer) headers.set('Authorization', `Bearer ${init.bearer}`)
  const res = await fetch(`${url}/auth/v1${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const raw = String(data.error_description || data.msg || data.message || data.error || `Request failed (${res.status})`)
    const msg = /invalid login credentials/i.test(raw)
      ? 'Wrong email or password.'
      : /rate limit|too many/i.test(raw) || res.status === 429
        ? 'Too many emails or attempts — please wait a while and try again.'
        : raw
    throw Object.assign(new Error(msg), { status: res.status })
  }
  return data
}

export async function signIn(email: string, password: string): Promise<Session> {
  const d = (await authFetch('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  })) as TokenResponse
  const s = toSession(d, email)
  write(s)
  return s
}

let refreshing: Promise<Session | null> | null = null
async function refresh(): Promise<Session | null> {
  if (!session) return null
  if (!refreshing) {
    const rt = session.refresh_token
    refreshing = authFetch('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: rt }) })
      .then((d) => {
        const s = toSession(d as TokenResponse, session?.email)
        write(s)
        return s
      })
      .catch(() => {
        write(null) // refresh token revoked / expired -> log in again
        return null
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

/** A valid access token (refreshed when it expires within a minute), or null when logged out. */
export async function getAccessToken(): Promise<string | null> {
  if (!session) return null
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token
  const s = await refresh()
  return s?.access_token ?? null
}

export async function signOut(): Promise<void> {
  const token = session?.access_token
  write(null)
  if (token) {
    try {
      await authFetch('/logout', { method: 'POST', bearer: token })
    } catch {
      /* already invalid */
    }
  }
}

/**
 * Sends Supabase's password-reset email. The link comes back to "/?reset=1" (no hash, so it matches the
 * Auth redirect allow-list https://www.listingneeded.com/** cleanly) and captureRecoveryFromUrl() opens /#/reset-password.
 */
export async function requestPasswordReset(email: string = ADMIN_EMAIL): Promise<void> {
  const redirect = `${window.location.origin}/?reset=1`
  await authFetch(`/recover?redirect_to=${encodeURIComponent(redirect)}`, {
    method: 'POST',
    body: JSON.stringify({ email: (email || ADMIN_EMAIL).trim().toLowerCase() }),
  })
}

export type Recovery = { access_token?: string; refresh_token?: string; expires_in?: string; error?: string }

export const RECOVERY_EVENT = 'listingneeded:recovery'

function friendlyLinkError(code: string, description: string): string {
  if (/otp_expired|expired|not found|invalid/i.test(`${code} ${description}`))
    return 'This reset link was already used, replaced by a newer email, or has expired.'
  return description || 'The reset link could not be used.'
}

/**
 * v51: runs BEFORE the hash router renders (and again on every hash change). Supabase sends the reset link back as
 *   /?reset=1#access_token=…&type=recovery            (implicit flow, success)
 *   /?reset=1#error=access_denied&error_code=otp_expired&error_description=…   (used / expired link)
 *   /#error=…  or  /#access_token=…                     (when Supabase falls back to the Site URL)
 *   /?code=…                                            (PKCE style)
 * and sometimes glued onto a hash route ("#/reset-password#access_token=…"). Any of these used to fall through to
 * the router's catch-all and show the homepage. Now every auth return is captured, the tokens are moved out of the
 * URL into sessionStorage, and the app opens /#/reset-password (form, or a clear "expired link" message).
 * Returns true when it rerouted.
 */
export function captureRecoveryFromUrl(): boolean {
  const { search, hash, pathname } = window.location
  const q = new URLSearchParams(search)
  // the auth part of the hash: everything after the last "#" that looks like key=value (handles "#/x#access_token=…")
  const rawHash = hash.replace(/^#/, '')
  const authPart = rawHash.includes('#') ? rawHash.slice(rawHash.lastIndexOf('#') + 1) : rawHash.replace(/^\/?/, '')
  const h = new URLSearchParams(/(^|&)(access_token|error|error_code|error_description|type)=/.test(authPart) ? authPart : '')
  const get = (k: string) => h.get(k) || q.get(k) || ''

  const marker = q.has('reset') || q.has('reset-password')
  const hasToken = !!h.get('access_token')
  const hasError = !!(get('error') || get('error_code') || get('error_description'))
  const hasCode = !!q.get('code')
  const isRecoveryType = get('type') === 'recovery'
  if (!marker && !hasToken && !hasError && !hasCode && !isRecoveryType) return false

  let rec: Recovery | null = null
  if (hasToken) {
    rec = { access_token: h.get('access_token') || '', refresh_token: h.get('refresh_token') || '', expires_in: h.get('expires_in') || '3600' }
  } else if (hasError) {
    rec = { error: friendlyLinkError(get('error_code') || get('error'), get('error_description').replace(/\+/g, ' ')) }
  } else if (hasCode) {
    // this site uses the implicit flow; a ?code= link can't be exchanged without the browser that requested it
    rec = { error: 'This reset link can’t be used here (it may be old or opened in a different browser).' }
  }
  try {
    if (rec) sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(rec))
  } catch {
    /* ignore */
  }
  window.history.replaceState(null, '', `${pathname || '/'}#/reset-password`)
  window.dispatchEvent(new Event(RECOVERY_EVENT))
  return true
}

/** Catch auth returns that arrive after the app is already open (same tab): run before the router's listeners. */
export function watchRecoveryInUrl() {
  const check = () => {
    captureRecoveryFromUrl()
  }
  window.addEventListener('popstate', check)
  window.addEventListener('hashchange', check)
}

export function takeRecovery(): Recovery | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(RECOVERY_KEY) || 'null') as Recovery | null
    return r
  } catch {
    return null
  }
}

export function clearRecovery() {
  try {
    sessionStorage.removeItem(RECOVERY_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Fallback while the Supabase Site URL still points elsewhere: paste the "Reset password" link from the email
 * (…/auth/v1/verify?token=…&type=recovery…). Its token is exchanged here for a recovery session.
 */
export async function recoveryFromPastedLink(link: string): Promise<Recovery> {
  let token = ''
  try {
    const u = new URL(link.trim())
    if (!/\.supabase\.co$/i.test(u.hostname) || u.searchParams.get('type') !== 'recovery') throw new Error('x')
    token = u.searchParams.get('token') || ''
  } catch {
    throw new Error('Paste the full “Reset password” link from the email (it starts with https://…supabase.co/auth/v1/verify).')
  }
  if (!token) throw new Error('That link has no reset token.')
  const d = (await authFetch('/verify', { method: 'POST', body: JSON.stringify({ type: 'recovery', token_hash: token }) }).catch(() => {
    throw new Error('This reset link was already used or has expired. Request a new one.')
  })) as TokenResponse
  const rec: Recovery = { access_token: d.access_token, refresh_token: d.refresh_token, expires_in: String(d.expires_in || 3600) }
  try {
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(rec))
  } catch {
    /* ignore */
  }
  return rec
}

/** Set a new password with the recovery session from the email link; then you're logged in. */
export async function setNewPassword(rec: Recovery, password: string): Promise<void> {
  if (!rec.access_token) throw new Error('The reset link is invalid or has expired. Request a new one.')
  const user = (await authFetch('/user', { method: 'PUT', bearer: rec.access_token, body: JSON.stringify({ password }) })) as {
    email?: string
  }
  write(
    toSession(
      { access_token: rec.access_token, refresh_token: rec.refresh_token || '', expires_in: Number(rec.expires_in) || 3600, user },
      user.email,
    ),
  )
  clearRecovery()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      session = read()
      cb()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, () => session, () => null)
}

setAccessTokenProvider(getAccessToken)
