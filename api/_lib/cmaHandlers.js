/** Request handlers for /api/cma and /api/cma-leads — shared by Vercel functions and the Vite dev server. */
import { timingSafeEqual } from 'node:crypto'
import { isValidEmail, normalizeUsPhone, runCma } from './cma.js'
import { sendCmaEmails } from './cmaEmail.js'
import { listLeads, saveLead } from './cmaLeads.js'

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
  })
  if (!leadRes.saved) console.error('[cma] lead not saved:', leadRes.error)

  const emailed = /requester: sent/.test(emailStatus)
  if (!result) {
    return {
      status: failure?.status || 502,
      body: { error: failure?.message || 'CMA failed', leadSaved: leadRes.saved, emailed: false },
    }
  }
  return { status: 200, body: { result, leadSaved: leadRes.saved, emailed, emailStatus: emailed ? 'sent' : emailStatus } }
}

function safeEq(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function handleCmaLeads(adminPassword) {
  const expected = process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || ''
  if (!expected) return { status: 500, body: { error: 'Admin password not configured on the server.' } }
  if (!adminPassword || !safeEq(adminPassword, expected)) return { status: 401, body: { error: 'Unauthorized' } }
  try {
    return { status: 200, body: { leads: await listLeads() } }
  } catch (err) {
    return { status: err.status || 502, body: { error: err.message, needs: err.needs || null } }
  }
}
