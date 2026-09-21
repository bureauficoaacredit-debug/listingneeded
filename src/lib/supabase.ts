import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — Supabase calls will fail until env is set.',
  )
}

/**
 * VITE_SUPABASE_ANON_KEY may be either:
 * - a legacy anon JWT (eyJ...), or
 * - a new sb_publishable_... key (not a JWT).
 *
 * supabase-js always sends the key as Authorization: Bearer <key>. Some
 * Supabase paths reject non-JWT Bearer tokens with "Invalid JWT". For
 * publishable keys we strip that Authorization header and rely on the
 * apikey header alone (which curl-style REST inserts already use successfully).
 */
function isPublishableKey(key: string): boolean {
  return key.startsWith('sb_publishable_')
}

function fetchWithoutBogusBearer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const key = anonKey ?? ''
  if (!isPublishableKey(key) || !init?.headers) {
    return fetch(input, init)
  }

  const headers = new Headers(init.headers)
  const auth = headers.get('Authorization')
  if (auth && /^Bearer\s+sb_publishable_/i.test(auth)) {
    headers.delete('Authorization')
  }
  return fetch(input, { ...init, headers })
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithoutBogusBearer,
  },
})
