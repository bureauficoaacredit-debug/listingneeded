/** Save CMA leads in Supabase table public.cma_leads (RLS: public insert-only). Admin reads/edits use code-gated RPCs. */
import { supabaseHeaders } from './cma.js'

export async function saveLead(row) {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  if (!url || !key) return { saved: false, error: 'Supabase URL/key not configured on the server' }
  try {
    const res = await fetch(`${url}/rest/v1/cma_leads`, {
      method: 'POST',
      headers: supabaseHeaders(key, { Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { saved: false, error: (await res.text()).slice(0, 300) }
    return { saved: true }
  } catch (err) {
    return { saved: false, error: err.message }
  }
}
