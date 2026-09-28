/** Save / list CMA leads in Supabase table public.cma_leads (RLS: public insert-only, reads need the service role). */
import { supabaseHeaders } from './cma.js'

function cfg() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  return { url, service, anon }
}

export async function saveLead(row) {
  const { url, service, anon } = cfg()
  const key = service || anon
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

export async function listLeads(limit = 500) {
  const { url, service } = cfg()
  if (!url) throw Object.assign(new Error('VITE_SUPABASE_URL not set on the server'), { status: 500 })
  if (!service) {
    throw Object.assign(
      new Error(
        'Set SUPABASE_SERVICE_ROLE_KEY in Vercel (Project → Settings → Environment Variables) to view leads here. Leads are still being saved — see Supabase → Table Editor → cma_leads.',
      ),
      { status: 503, needs: 'SUPABASE_SERVICE_ROLE_KEY' },
    )
  }
  const res = await fetch(`${url}/rest/v1/cma_leads?select=*&order=created_at.desc&limit=${limit}`, {
    headers: supabaseHeaders(service),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error((await res.text()).slice(0, 300))
  return res.json()
}
