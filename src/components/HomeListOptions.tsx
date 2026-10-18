import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getQrCodes, type QrKind } from '../lib/store'

// v61: the scanner (and its jsQR fallback) only downloads when someone taps the QR option
const QrScannerModal = lazy(() => import('./QrScannerModal'))
const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches

/**
 * v60: three ways to list from the homepage card. The QR option (last) respects the v50 admin switch
 * "Show QR codes on website" (hidden when Off) and uses the PAID QR flow unless the FREE QR is On.
 */
export default function HomeListOptions() {
  const [kind, setKind] = useState<QrKind | null>(null)
  const [img, setImg] = useState('')
  const [scan, setScan] = useState(false)
  useEffect(() => {
    let live = true
    void getQrCodes().then(async (c) => {
      if (!c.show_on_site) return
      const k: QrKind | null = c.free.enabled && !c.free.hidden ? 'free' : c.paid.enabled && !c.paid.hidden ? 'paid' : null
      if (!k || !live) return
      setKind(k)
      const { qrDataUrl } = await import('../lib/qr') // QR generator only loads when the switch is On
      const url = await qrDataUrl(k, 160)
      if (live) setImg(url)
    })
    return () => {
      live = false
    }
  }, [])
  const qrTo = kind === 'free' ? '/list?plan=free&src=qr' : '/list?src=qr-paid'
  return (
    <ol className="list-options">
      <li>
        <Link className="list-option" to="/list?photo=1">
          <span className="list-option-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          </span>
          <span>Take a picture of your house and upload it</span>
        </Link>
      </li>
      <li>
        <Link className="list-option" to="/list">
          <span className="list-option-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
          </span>
          <span>Start manually</span>
        </Link>
      </li>
      {kind ? (
        <li>
          {isPhone() ? (
            // phones: you can't scan your own screen, so the main action opens the in-page camera scanner
            <button type="button" className="list-option" onClick={() => setScan(true)}>
              {img ? <img className="list-option-qr" src={img} alt="" width={44} height={44} /> : <span className="list-option-qr" />}
              <span>Scan the QR code on your For Sale sign</span>
            </button>
          ) : (
            <Link className="list-option" to={qrTo}>
              {img ? <img className="list-option-qr" src={img} alt="QR code" width={44} height={44} /> : <span className="list-option-qr" />}
              <span>Scan the QR code on your For Sale sign</span>
            </Link>
          )}
          {scan ? (
            <Suspense fallback={<div className="qrs"><div className="qrs-bottom"><p className="qrs-hint">Opening camera…</p></div></div>}>
              <QrScannerModal onClose={() => setScan(false)} />
            </Suspense>
          ) : null}
        </li>
      ) : null}
    </ol>
  )
}
