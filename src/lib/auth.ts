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

/** Sends Supabase's password-reset email; the link comes back to /#/reset-password on this site. */
export async function requestPasswordReset(email: string): Promise<void> {
  const redirect = `${window.location.origin}/?reset-password=1`
  await authFetch(`/recover?redirect_to=${encodeURIComponent(redirect)}`, {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  })
}

export type Recovery = { access_token?: string; refresh_token?: string; expires_in?: string; error?: string }

/**
 * Called before the router starts: the reset link lands on "/?reset-password=1#access_token=…&type=recovery"
 * (or "#error=…"). Keep the tokens out of the URL and open the reset page.
 */
export function captureRecoveryFromUrl() {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (!/(^|&)(access_token|error)=/.test(h)) return
  const p = new URLSearchParams(h)
  const isRecovery = p.get('type') === 'recovery' || /reset-password/.test(window.location.search)
  if (!isRecovery) return
  const rec: Recovery = p.get('error')
    ? { error: p.get('error_description') || p.get('error') || 'The reset link is invalid or has expired.' }
    : { access_token: p.get('access_token') || '', refresh_token: p.get('refresh_token') || '', expires_in: p.get('expires_in') || '3600' }
  try {
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(rec))
  } catch {
    /* ignore */
  }
  window.history.replaceState(null, '', `${window.location.pathname}#/reset-password`)
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
