/**
 * CMA report emails via Resend (https://resend.com) — plain REST, no SDK.
 *
 * Env:
 *   RESEND_API_KEY    required to send (without it the CMA still shows on screen and the lead is saved)
 *   CMA_EMAIL_FROM    optional sender, e.g. "Marcel Najar <cma@listingneeded.com>" (domain must be verified in Resend).
 *                     Defaults to Resend's test sender onboarding@resend.dev, which can ONLY deliver to the
 *                     Resend account owner's own address — so requester emails need a verified domain.
 *   CMA_NOTIFY_EMAIL  optional, where lead notifications go (default bureauficoaacredit@gmail.com)
 */
import { MARCEL } from './cma.js'

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const money = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`)
const val = (n, suffix = '') => (n == null ? '—' : `${Number(n).toLocaleString('en-US')}${suffix}`)

export function emailConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.CMA_EMAIL_FROM || 'Listing Needed <onboarding@resend.dev>',
    notify: process.env.CMA_NOTIFY_EMAIL || MARCEL.email,
  }
}

export function renderReportHtml(r, lead) {
  const s = r.subject
  const e = r.estimate
  const rows = r.comps
    .map(
      (c) => `<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #e3e8ef">${c.url ? `<a href="${esc(c.url)}" style="color:#0B3A6E">${esc(c.address)}</a>` : esc(c.address)}<br><span style="color:#667;font-size:12px">${esc(c.town)}</span></td>
  <td style="padding:6px 8px;border-bottom:1px solid #e3e8ef;text-align:right"><b>${money(c.price)}</b><br><span style="color:#667;font-size:12px">${c.status === 'Sold' ? `Sold ${esc(c.date || '')}` : 'Active'}</span></td>
  <td style="padding:6px 8px;border-bottom:1px solid #e3e8ef;text-align:center">${val(c.beds)} / ${val(c.baths)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e3e8ef;text-align:right">${val(c.sqft)}${c.ppsf ? `<br><span style="color:#667;font-size:12px">$${c.ppsf}/sf</span>` : ''}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e3e8ef;text-align:right">${c.distanceMi == null ? '—' : `${c.distanceMi} mi`}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #e3e8ef;font-size:12px;color:#556">${esc(c.source)}</td>
</tr>`,
    )
    .join('')
  const methods = (e?.methods || [])
    .map((m) => `<li><b>${esc(m.name)}:</b> ${money(m.value)} <span style="color:#667">(${esc(m.detail)})</span></li>`)
    .join('')
  const sources = r.sources.map((x) => `<li>${esc(x.name)} — <i>${esc(x.status)}</i>${x.detail ? `: ${esc(x.detail)}` : ''}</li>`).join('')
  return `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1d2733">
<div style="max-width:720px;margin:0 auto;background:#fff">
  <div style="background:#0B3A6E;color:#fff;padding:18px 24px"><b style="font-size:20px;letter-spacing:.06em">LISTING NEEDED</b><div style="font-size:13px;opacity:.85">Home value report (CMA)</div></div>
  <div style="padding:22px 24px">
    <p style="margin:0 0 12px">Hi ${esc(lead.name)},</p>
    <p style="margin:0 0 16px">Here is the home value report you requested for <b>${esc(s.matchedAddress)}</b>.</p>
    <div style="border:1px solid #d7dee8;padding:16px;text-align:center;margin-bottom:16px">
      <div style="font-size:12px;letter-spacing:.1em;color:#667">ESTIMATED VALUE</div>
      <div style="font-size:32px;font-weight:bold;color:#0B3A6E">${e ? money(e.value) : 'Not enough data'}</div>
      ${e ? `<div style="color:#445">Likely range ${money(e.low)} – ${money(e.high)}</div>` : ''}
    </div>
    <p style="margin:0 0 6px"><b>Subject:</b> ${esc(s.propertyType)}${s.style ? `, ${esc(s.style)}` : ''} · ${val(s.beds)} bd · ${val(s.baths)} ba · ${val(s.sqft)} sq ft${s.yearBuilt ? ` · built ${s.yearBuilt}` : ''}${s.assessed ? ` · assessed ${money(s.assessed)}` : ''}</p>
    <p style="margin:0 0 14px"><b>Comps:</b> ${r.stats.soldCount} sold (avg ${money(r.stats.soldAvg)}, median ${money(r.stats.soldMedian)}${r.stats.soldMedianPpsf ? `, median $${r.stats.soldMedianPpsf}/sq ft` : ''}) · ${r.stats.activeCount} active${r.stats.activeCount ? ` (median ${money(r.stats.activeMedian)})` : ''}</p>
    ${methods ? `<ul style="margin:0 0 16px;padding-left:18px">${methods}</ul>` : ''}
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#eef2f7;text-align:left"><th style="padding:6px 8px">Address</th><th style="padding:6px 8px;text-align:right">Price</th><th style="padding:6px 8px">Bd/Ba</th><th style="padding:6px 8px;text-align:right">Sq ft</th><th style="padding:6px 8px;text-align:right">Dist.</th><th style="padding:6px 8px">Source</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="padding:8px">No comparable properties found.</td></tr>'}</tbody>
    </table>
    <p style="font-size:12px;color:#556;margin:16px 0 6px"><b>Sources</b></p><ul style="font-size:12px;color:#556;margin:0;padding-left:18px">${sources}</ul>
    <p style="font-size:12px;color:#556;margin:14px 0 0">${esc(r.disclaimer)}</p>
    <div style="margin-top:20px;padding:14px 16px;background:#800020;color:#fff">
      Want an exact price from a licensed Realtor®? <b>${esc(MARCEL.name)}</b> · <a href="https://${MARCEL.site}" style="color:#fff">${MARCEL.site}</a> · <a href="tel:2038183242" style="color:#fff">${MARCEL.phone}</a>
    </div>
  </div>
</div></body></html>`
}

function renderText(r, lead) {
  const e = r.estimate
  return [
    `Hi ${lead.name},`,
    '',
    `Home value report for ${r.subject.matchedAddress}`,
    e ? `Estimated value: ${money(e.value)} (range ${money(e.low)} – ${money(e.high)})` : 'Estimate: not enough data',
    '',
    ...r.comps.map((c) => `- ${c.address}, ${c.town}: ${money(c.price)} ${c.status === 'Sold' ? `sold ${c.date}` : 'active'} · ${c.beds ?? '—'} bd / ${c.baths ?? '—'} ba · ${c.sqft ?? '—'} sf · ${c.distanceMi ?? '—'} mi · ${c.source}`),
    '',
    r.disclaimer,
    '',
    `${MARCEL.name} · ${MARCEL.site} · ${MARCEL.phone}`,
  ].join('\n')
}

async function resendSend(apiKey, payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.message || `Resend ${res.status}`)
  return body.id
}

/**
 * Email the report to the requester and a lead notification to Marcel.
 * Never throws; returns a short status string for the lead row.
 */
export async function sendCmaEmails(result, lead, error) {
  const cfg = emailConfig()
  if (!cfg.apiKey) return 'not sent: RESEND_API_KEY not set'
  const parts = []
  if (result) {
    try {
      await resendSend(cfg.apiKey, {
        from: cfg.from,
        to: [lead.email],
        reply_to: cfg.notify,
        subject: `Your home value report — ${result.subject.matchedAddress}`,
        html: renderReportHtml(result, lead),
        text: renderText(result, lead),
      })
      parts.push('requester: sent')
    } catch (err) {
      parts.push(`requester: failed (${err.message})`)
    }
  }
  try {
    const head = `<div style="font-family:Arial,sans-serif;padding:16px 24px;background:#fffbe6;border-bottom:1px solid #eadf9e">
<b>New CMA lead</b><br>Name: ${esc(lead.name)}<br>Email: <a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a><br>
Phone: <a href="tel:${esc(lead.phone.replace(/\D/g, ''))}">${esc(lead.phone)}</a><br>Address: ${esc(lead.address)}<br>
${result ? `Summary: ${esc(result.summary)}` : `No report — ${esc(error || 'CMA failed')}`}</div>`
    await resendSend(cfg.apiKey, {
      from: cfg.from,
      to: [cfg.notify],
      reply_to: lead.email,
      subject: `New CMA lead: ${lead.name} — ${lead.address}`,
      html: result ? head + renderReportHtml(result, lead) : head,
      text: `New CMA lead\n${lead.name}\n${lead.email}\n${lead.phone}\n${lead.address}\n${result ? result.summary : error || ''}`,
    })
    parts.push('marcel: sent')
  } catch (err) {
    parts.push(`marcel: failed (${err.message})`)
  }
  return parts.join('; ')
}
