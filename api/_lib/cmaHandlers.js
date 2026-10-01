/** Request handlers for /api/cma and /api/property-lookup — shared by Vercel functions and the Vite dev server. */
import { isValidEmail, lookupProperty, normalizeUsPhone, runCma } from './cma.js'
import { sendCmaEmails } from './cmaEmail.js'
import { saveLead } from './cmaLeads.js'

const clip = (v, n) => String(v ?? '').trim().slice(0, n)
const optNum = (v, max) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n <= max ? n : null
}

/** @returns {Promise<{status:number, body:object}>} */
export async function handleCma(body) {
  if (body.website) return { status: 400, body: { error: 'Invalid request.' } } // honeypot
  const name = clip(body.name, 200)
  const email = clip(body.email, 320).toLowerCase()
  const phone = normalizeUsPhone(body.phone)
  const address = clip(body.address, 400)
  const errors = {}
  if (!name) errors.name = 'Enter your name.'
  if (!isValidEmail(email)) errors.email = 'Enter a valid email address.'
  if (!phone) errors.phone = 'Enter a valid US phone number (10 digits).'
  if (address.length < 5) errors.address = 'Enter the full property address.'
  if (Object.keys(errors).length) return { status: 400, body: { error: Object.values(errors)[0], errors } }

  const beds = optNum(body.beds, 30)
  const baths = optNum(body.baths, 30)
  const sqft = optNum(body.sqft, 100000)
  const lead = { name, email, phone, address }

  let result = null
  let failure = null
  try {
    result = await runCma({ address, beds, baths, sqft })
  } catch (err) {
    failure = err
    console.error('[cma] failed:', err)
  }

  // Owner names stay server-side: saved on the lead row (admin-only RPC) and removed from the visitor response.
  const ownerNames = result?._private?.owners?.length ? result._private.owners.join(' / ').slice(0, 400) : null
  if (result) delete result._private
  const emailStatus = await sendCmaEmails(result, lead, failure?.message)
  const leadRes = await saveLead({
    ...lead,
    beds,
    baths,
    sqft,
    estimate: result?.estimate?.value ?? null,
    estimate_low: result?.estimate?.low ?? null,
    estimate_high: result?.estimate?.high ?? null,
    comps_count: result ? result.comps.length : 0,
    result_summary: result ? result.summary : `No report: ${failure?.message || 'unknown error'}`,
    email_status: emailStatus,
    owner_names: ownerNames,
  })
  if (!leadRes.saved) console.error('[cma] lead not saved:', leadRes.error)

  const emailed = /requester: sent/.test(emailStatus || '')
  if (!result) {
    return {
      status: failure?.status || 502,
      body: { error: failure?.message || 'CMA failed', leadSaved: leadRes.saved, emailed: false },
    }
  }
  return { status: 200, body: { result, leadSaved: leadRes.saved, emailed, emailStatus: emailed ? 'sent' : null } }
}

/** POST /api/property-lookup — listing-form autofill. Facts only (no owner names). */
export async function handlePropertyLookup(body) {
  const address = clip(body.address, 200)
  if (address.length < 3) return { status: 400, body: { found: false, error: 'Enter an address.' } }
  const out = await lookupProperty({
    address,
    city: clip(body.city, 80),
    state: clip(body.state, 2) || 'CT',
    zip: clip(body.zip, 10),
  })
  // never expose raw source diagnostics beyond status names
  return { status: 200, body: { ...out, sources: undefined } }
}
