import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { getQrCodes, QR_URLS, type QrCodesSetting, type QrKind } from '../lib/store'
import { qrBadge, qrDataUrl, QR_TITLE } from '../lib/qr'

/** v50: printable flyer page for one QR code (/#/qr/free or /#/qr/paid). */
export default function QrPrint() {
  const { kind } = useParams()
  const k = kind === 'free' || kind === 'paid' ? (kind as QrKind) : null
  const [img, setImg] = useState('')
  const [cfg, setCfg] = useState<QrCodesSetting | null>(null)
  useEffect(() => {
    if (!k) return
    void qrDataUrl(k, 900).then(setImg)
    void getQrCodes().then(setCfg)
  }, [k])
  if (!k) return <Navigate to="/" replace />
  const c = cfg?.[k]
  return (
    <div className="qr-print">
      {c && (!c.enabled || c.hidden) ? (
        <div className="fee-box no-print">This code is Off right now — scans will show “not active right now” until you switch it On in Admin → QR codes.</div>
      ) : null}
      <div className="qr-sheet">
        <img className="qr-sheet-logo" src="/logo/logo-dark@2x.png" alt="Listing Needed" width={462} height={45} />
        <h1>Scan to list your home</h1>
        <span className={`qr-sheet-label qr-${k}`}>{qrBadge(k, c?.label ?? (k === 'free' ? 'Free listing' : 'List your home'))}</span>
        {img ? <img className="qr-sheet-code" src={img} alt={`QR code: ${QR_URLS[k]}`} /> : <div className="qr-sheet-code" />}
        <p className="qr-sheet-sub">{k === 'free' ? 'Free listing — no payment needed.' : 'Flat fee: $99 to rent · $800 to sell. Pay securely online.'}</p>
        <div className="qr-sheet-contact">
          <strong>Marcel Najar</strong>
          <span>www.listingneeded.com · 203-818-3242</span>
        </div>
      </div>
      <button type="button" className="btn big no-print" onClick={() => window.print()}>
        Print
      </button>
    </div>
  )
}
