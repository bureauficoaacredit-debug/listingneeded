/**
 * Lightweight Supabase REST helpers — avoids @supabase/supabase-js Headers TypeError
 * when Postgrest passes undefined header values, and correctly handles sb_publishable_ keys.
 */

export type SupabaseConfig = {
  url: string
  anonKey: string
}

export function getConfig(): SupabaseConfig {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

  if (!url || !anonKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — set them in the environment.',
    )
  }

  return { url, anonKey }
}

/** Legacy anon JWTs start with eyJ; new publishable keys must not be sent as Bearer. */
function isJwtKey(key: string): boolean {
  return key.startsWith('eyJ')
}

/**
 * Build fetch Headers carefully — never set undefined/null (Chrome throws TypeError).
 * Always sends apikey. Authorization Bearer only for legacy JWT keys.
 */
export function buildSupabaseHeaders(
  anonKey: string,
  extra?: Record<string, string | undefined | null>,
): Headers {
  const headers = new Headers()
  headers.set('apikey', anonKey)

  if (isJwtKey(anonKey)) {
    headers.set('Authorization', `Bearer ${anonKey}`)
  }

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value != null && value !== '') {
        headers.set(key, value)
      }
    }
  }

  return headers
}

/**
 * Fetch against Supabase (path is absolute from project root, e.g. /rest/v1/listings).
 * Throws Error with response text on non-OK so the UI can show real errors.
 */
export async function supabaseFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { url, anonKey } = getConfig()

  const extra: Record<string, string | undefined | null> = {}
  // Merge caller headers without letting undefined values through
  if (init.headers) {
    const incoming = new Headers(init.headers as HeadersInit)
    incoming.forEach((value, key) => {
      extra[key] = value
    })
  }

  const headers = buildSupabaseHeaders(anonKey, extra)

  const res = await fetch(`${url}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
  })

  return res
}

/** Throw with response body text so UI catch blocks show real API errors. */
export async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return
  const text = await res.text().catch(() => '')
  throw new Error(text || `${res.status} ${res.statusText}`)
}
