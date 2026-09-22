import { getConfig } from './supabase'

/** Prefer Supabase Edge Functions; fall back to same-origin /api if present. */
export function checkoutEndpoints() {
  try {
    const { url } = getConfig()
    const base = `${url}/functions/v1`
    return {
      create: `${base}/create-checkout`,
      confirm: `${base}/confirm-checkout`,
      useAnonKey: true,
    }
  } catch {
    return {
      create: '/api/create-checkout',
      confirm: '/api/confirm-checkout',
      useAnonKey: false,
    }
  }
}

export async function createCheckoutSession(payload: {
  listingId: string
  type: 'rent' | 'sale'
  email?: string
  address?: string
}) {
  const ep = checkoutEndpoints()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ep.useAnonKey) {
    const { anonKey } = getConfig()
    headers.apikey = anonKey
    headers.Authorization = `Bearer ${anonKey}`
  }
  const res = await fetch(ep.create, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...payload,
      siteOrigin: window.location.origin,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.url) {
    throw new Error(
      body.error ||
        'Could not start Stripe Checkout. Deploy Supabase functions and set STRIPE_SECRET_KEY secret.',
    )
  }
  return body as { url: string; id: string }
}

export async function confirmCheckoutSession(sessionId: string, listingId: string) {
  const ep = checkoutEndpoints()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ep.useAnonKey) {
    const { anonKey } = getConfig()
    headers.apikey = anonKey
    headers.Authorization = `Bearer ${anonKey}`
  }
  const res = await fetch(ep.confirm, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId, listingId }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || 'Payment confirmation failed')
  }
  return body
}
