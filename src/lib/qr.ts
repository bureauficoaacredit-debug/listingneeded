import QRCode from 'qrcode'
import { QR_URLS, type QrKind } from './store'

/** v50: QR codes are generated in the browser (free `qrcode` library) — no paid service, no network call. */
export const QR_DARK = '#0B2A4A'

export function qrDataUrl(kind: QrKind, width = 720): Promise<string> {
  return QRCode.toDataURL(QR_URLS[kind], { width, margin: 2, errorCorrectionLevel: 'M', color: { dark: QR_DARK, light: '#FFFFFF' } })
}

export const QR_TITLE: Record<QrKind, string> = { free: 'FREE', paid: 'PAID' }

/** "FREE · List your home", or just the label when it already says Free/Paid (avoids "FREE · FREE LISTING"). */
export function qrBadge(kind: QrKind, label: string): string {
  return new RegExp(kind, 'i').test(label) ? label : `${QR_TITLE[kind]} · ${label}`
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = src
  })
}

/** Flyer-ready PNG: heading, Free/Paid label, QR, brand and contact. */
export async function qrCardPng(kind: QrKind, label: string): Promise<string> {
  const W = 1200
  const H = 1650
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  await document.fonts?.ready
  g.fillStyle = '#FFFFFF'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#0B3A6E'
  g.fillRect(0, 0, W, 210)
  try {
    const logo = await loadImg('/logo/logo-white@2x.png')
    const lw = 760
    const lh = (logo.height / logo.width) * lw
    g.drawImage(logo, (W - lw) / 2, (210 - lh) / 2, lw, lh)
  } catch {
    g.fillStyle = '#FFFFFF'
    g.font = '700 64px Montserrat, sans-serif'
    g.textAlign = 'center'
    g.fillText('LISTINGNEEDED', W / 2, 130)
  }
  g.textAlign = 'center'
  g.fillStyle = '#0B2A4A'
  g.font = '800 92px Inter, Montserrat, sans-serif'
  g.fillText('Scan to list your home', W / 2, 345)
  // label pill
  const pill = qrBadge(kind, label).toUpperCase()
  g.font = '800 46px Inter, Montserrat, sans-serif'
  const pw = g.measureText(pill).width + 90
  g.fillStyle = kind === 'free' ? '#1F7A3A' : '#800020'
  roundRect(g, (W - pw) / 2, 395, pw, 86, 43)
  g.fill()
  g.fillStyle = '#FFFFFF'
  g.fillText(pill, W / 2, 454)
  const qr = await loadImg(await qrDataUrl(kind, 860))
  g.drawImage(qr, (W - 860) / 2, 515, 860, 860)
  g.fillStyle = '#0B2A4A'
  g.font = '700 50px Inter, Montserrat, sans-serif'
  g.fillText('Marcel Najar', W / 2, 1460)
  g.font = '500 44px Inter, Montserrat, sans-serif'
  g.fillText('www.listingneeded.com  ·  203-818-3242', W / 2, 1530)
  g.fillStyle = '#5b6b7b'
  g.font = '500 30px Inter, sans-serif'
  g.fillText(kind === 'free' ? 'Free listing — no payment needed' : 'Flat fee: $99 to rent · $800 to sell', W / 2, 1595)
  return c.toDataURL('image/png')
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

export function downloadDataUrl(dataUrl: string, name: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}
