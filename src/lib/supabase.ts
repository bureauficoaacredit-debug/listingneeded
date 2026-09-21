import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — Supabase calls will fail until env is set.',
  )
}

/**
 * Prefer the legacy anon JWT (eyJ...) from Supabase → Project Settings → API Keys
 * if the new sb_publishable_ key causes browser create failures.
 * Either value can be set as VITE_SUPABASE_ANON_KEY in Vercel.
 */
export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
