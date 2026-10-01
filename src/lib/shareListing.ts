import type { Listing } from './types'

export const CONTACT = { name: 'Marcel Najar', site: 'www.listingneeded.com', phone: '203-818-3242' }

export function listingUrl(l: Listing): string {
  return `${window.location.origin}/#/listing/${l.id}`
}

export function priceText(l: Listing): string {
  return l.type === 'rent' ? `$${l.price.toLocaleString()}/mo` : `$${l.price.toLocaleString()}`
}

export function shareText(l: Listing): string {
  return `${l.type === 'rent' ? 'For rent' : 'For sale'}: ${l.address}, ${l.city}, ${l.state} — ${priceText(l)} · ${l.beds} bd / ${l.baths} ba`
}

/** Load an image for canvas. Tries CORS first (canvas stays exportable); returns null if blocked. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width > maxWidth && cur) {
      lines.push(cur)
      cur = w
    } else cur = t
  }
  if (cur) lines.push(cur)
  return lines
}

/**
 * Draw a 1080×1350 shareable photo card: listing photo, price, address, beds/baths, Listing Needed contact.
 * Returns a PNG blob. If the photo can't be loaded (CORS), the card is still produced with a branded panel
 * and `photoIncluded` is false.
 */
export async function buildShareCard(l: Listing): Promise<{ blob: Blob; photoIncluded: boolean }> {
  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // photo area
  const PH = 760
  const photo = l.photoDataUrls[0] ? await loadImage(l.photoDataUrls[0]) : null
  if (photo) {
    const r = Math.max(W / photo.width, PH / photo.height)
    const w = photo.width * r
    const h = photo.height * r
    ctx.drawImage(photo, (W - w) / 2, (PH - h) / 2, w, h)
  } else {
    const g = ctx.createLinearGradient(0, 0, W, PH)
    g.addColorStop(0, '#0B3A6E')
    g.addColorStop(1, '#2f6aa5')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, PH)
    ctx.fillStyle = 'rgba(255,255,255,.9)'
    ctx.font = '800 64px Arial, Helvetica, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(l.type === 'rent' ? 'FOR RENT' : 'FOR SALE', W / 2, PH / 2 + 20)
  }
  // badge
  ctx.fillStyle = l.type === 'rent' ? '#0B3A6E' : '#800020'
  ctx.fillRect(0, 0, 250, 78)
  ctx.fillStyle = '#fff'
  ctx.font = '800 36px Arial, Helvetica, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(l.type === 'rent' ? 'FOR RENT' : 'FOR SALE', 125, 53)

  // details
  ctx.textAlign = 'left'
  ctx.fillStyle = '#0B3A6E'
  ctx.font = '800 92px Arial, Helvetica, sans-serif'
  ctx.fillText(priceText(l), 60, PH + 110)
  ctx.fillStyle = '#1d2733'
  ctx.font = '700 44px Arial, Helvetica, sans-serif'
  const lines = fitText(ctx, l.address, W - 120).slice(0, 2)
  lines.forEach((t, i) => ctx.fillText(t, 60, PH + 178 + i * 52))
  const y2 = PH + 178 + lines.length * 52
  ctx.fillStyle = '#556';
  ctx.font = '400 36px Arial, Helvetica, sans-serif'
  ctx.fillText(`${l.city}, ${l.state} ${l.zip}`, 60, y2 + 4)
  const facts = [`${l.beds} bd`, `${l.baths} ba`, l.sqft ? `${l.sqft.toLocaleString()} sq ft` : ''].filter(Boolean).join('   ·   ')
  ctx.fillStyle = '#1d2733'
  ctx.font = '700 38px Arial, Helvetica, sans-serif'
  ctx.fillText(facts, 60, y2 + 62)

  // footer band
  const FY = H - 150
  ctx.fillStyle = '#0B3A6E'
  ctx.fillRect(0, FY, W, 150)
  ctx.fillStyle = '#fff'
  ctx.font = '800 40px Arial, Helvetica, sans-serif'
  ctx.fillText('LISTING NEEDED', 60, FY + 62)
  ctx.font = '400 32px Arial, Helvetica, sans-serif'
  ctx.fillText(`${CONTACT.name} · ${CONTACT.site} · ${CONTACT.phone}`, 60, FY + 110)

  const blob: Blob = await new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png')
    } catch (e) {
      reject(e)
    }
  })
  return { blob, photoIncluded: !!photo }
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export const cardFilename = (l: Listing) =>
  `listing-${l.address.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}.png`
