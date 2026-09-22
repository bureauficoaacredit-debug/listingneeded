/**
 * POST /api/create-checkout
 * Body: { listingId, type: 'rent'|'sale', email?, address? }
 * Returns: { url } Stripe Checkout URL
 */
const FEE_CENTS = { rent: 9900, sale: 80000 }

function siteOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return res.status(500).json({
      error: 'STRIPE_SECRET_KEY is not set on the server (add it in Vercel → Environment Variables).',
    })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const listingId = String(body.listingId || '').trim()
    const type = body.type === 'sale' ? 'sale' : 'rent'
    const email = String(body.email || '').trim()
    const address = String(body.address || '').trim()

    if (!listingId) {
      return res.status(400).json({ error: 'listingId is required' })
    }

    const amount = FEE_CENTS[type]
    const origin = siteOrigin(req)
    const label = type === 'sale' ? 'Sale listing fee' : 'Rent listing fee'
    const productName = `Listing Needed — ${label}${address ? ` (${address})` : ''}`

    const params = new URLSearchParams()
    params.set('mode', 'payment')
    params.set('success_url', `${origin}/#/listing/${encodeURIComponent(listingId)}?session_id={CHECKOUT_SESSION_ID}&listed=1`)
    params.set('cancel_url', `${origin}/#/list?canceled=1`)
    params.set('client_reference_id', listingId)
    params.set('metadata[listingId]', listingId)
    params.set('metadata[listingType]', type)
    params.set('line_items[0][quantity]', '1')
    params.set('line_items[0][price_data][currency]', 'usd')
    params.set('line_items[0][price_data][unit_amount]', String(amount))
    params.set('line_items[0][price_data][product_data][name]', productName)
    params.set('line_items[0][price_data][product_data][description]', `One-time ${type} listing fee for Listing Needed`)
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
      return res.status(stripeRes.status).json({
        error: session.error?.message || session.message || 'Stripe Checkout failed',
      })
    }

    return res.status(200).json({ url: session.url, id: session.id })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Checkout create failed',
    })
  }
}
