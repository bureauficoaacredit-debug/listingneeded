import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const FEE_CENTS: Record<string, number> = { rent: 9900, sale: 80000 }

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
    if (!secret) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not set in Supabase secrets' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const listingId = String(body.listingId || '').trim()
    const type = body.type === 'sale' ? 'sale' : 'rent'
    const email = String(body.email || '').trim()
    const address = String(body.address || '').trim()
    const siteOrigin = String(body.siteOrigin || 'https://www.listingneeded.com').replace(/\/$/, '')

    if (!listingId) {
      return new Response(JSON.stringify({ error: 'listingId is required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const amount = FEE_CENTS[type]
    const label = type === 'sale' ? 'Sale listing fee' : 'Rent listing fee'
    const productName = `Listing Needed — ${label}${address ? ` (${address})` : ''}`

    const params = new URLSearchParams()
    params.set('mode', 'payment')
    params.set(
      'success_url',
      `${siteOrigin}/#/listing/${encodeURIComponent(listingId)}?session_id={CHECKOUT_SESSION_ID}&listed=1`,
    )
    params.set('cancel_url', `${siteOrigin}/#/list?canceled=1`)
    params.set('client_reference_id', listingId)
    params.set('metadata[listingId]', listingId)
    params.set('metadata[listingType]', type)
    params.set('line_items[0][quantity]', '1')
    params.set('line_items[0][price_data][currency]', 'usd')
    params.set('line_items[0][price_data][unit_amount]', String(amount))
    params.set('line_items[0][price_data][product_data][name]', productName)
    params.set(
      'line_items[0][price_data][product_data][description]',
      `One-time ${type} listing fee for Listing Needed`,
    )
    if (email) params.set('customer_email', email)

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    const session = await stripeRes.json()
    if (!stripeRes.ok) {
      return new Response(
        JSON.stringify({ error: session.error?.message || session.message || 'Stripe Checkout failed' }),
        { status: stripeRes.status, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ url: session.url, id: session.id }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Checkout failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
