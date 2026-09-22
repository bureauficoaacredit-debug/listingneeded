import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    const secret = Deno.env.get('STRIPE_SECRET_KEY')
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL') || '').replace(/\/$/, '')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''

    if (!secret) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not set in Supabase secrets' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Supabase URL/key missing in function env' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const sessionId = String(body.sessionId || '').trim()
    const listingId = String(body.listingId || '').trim()
    if (!sessionId || !listingId) {
      return new Response(JSON.stringify({ error: 'sessionId and listingId are required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    )
    const session = await stripeRes.json()
    if (!stripeRes.ok) {
      return new Response(
        JSON.stringify({ error: session.error?.message || 'Could not load Stripe session' }),
        { status: stripeRes.status, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }
    if (session.payment_status !== 'paid') {
      return new Response(
        JSON.stringify({ error: 'Payment not completed', payment_status: session.payment_status }),
        { status: 402, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const metaListing = session.metadata?.listingId || session.client_reference_id
    if (metaListing && metaListing !== listingId) {
      return new Response(JSON.stringify({ error: 'Listing id does not match this payment session' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const headers: Record<string, string> = {
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    }
    if (serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${serviceKey}`

    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/listings?id=eq.${encodeURIComponent(listingId)}`,
      { method: 'PATCH', headers, body: JSON.stringify({ paid: true, live: true }) },
    )
    const text = await patchRes.text()
    if (!patchRes.ok) {
      return new Response(JSON.stringify({ error: text || 'Failed to activate listing' }), {
        status: patchRes.status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const rows = JSON.parse(text || '[]')
    return new Response(JSON.stringify({ ok: true, listing: rows[0] || null }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Confirm failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
