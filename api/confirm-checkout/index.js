export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.STRIPE_SECRET_KEY
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(
    /\/$/,
    '',
  )
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY

  if (!secret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not set on the server.' })
  }
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Supabase URL/key missing on server (VITE_SUPABASE_URL + anon or service role).',
    })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const sessionId = String(body.sessionId || '').trim()
    const listingId = String(body.listingId || '').trim()
    if (!sessionId || !listingId) {
      return res.status(400).json({ error: 'sessionId and listingId are required' })
    }

    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    )
    const session = await stripeRes.json()
    if (!stripeRes.ok) {
      return res.status(stripeRes.status).json({
        error: session.error?.message || 'Could not load Stripe session',
      })
    }

    if (session.payment_status !== 'paid') {
      return res
        .status(402)
        .json({ error: 'Payment not completed', payment_status: session.payment_status })
    }

    const metaListing = session.metadata?.listingId || session.client_reference_id
    if (metaListing && metaListing !== listingId) {
      return res.status(400).json({ error: 'Listing id does not match this payment session' })
    }

    const headers = {
      apikey: supabaseKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    }
    if (supabaseKey.startsWith('eyJ')) {
      headers.Authorization = `Bearer ${supabaseKey}`
    }

    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/listings?id=eq.${encodeURIComponent(listingId)}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ paid: true, live: true }),
      },
    )

    const text = await patchRes.text()
    if (!patchRes.ok) {
      return res.status(patchRes.status).json({ error: text || 'Failed to activate listing' })
    }

    const rows = JSON.parse(text || '[]')
    return res.status(200).json({ ok: true, listing: rows[0] || null })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Confirm failed',
    })
  }
}
