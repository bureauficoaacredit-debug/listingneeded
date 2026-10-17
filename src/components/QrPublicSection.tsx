import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getQrCodes, type QrCodesSetting, type QrKind } from '../lib/store'
import { qrBadge, qrDataUrl, QR_TITLE } from '../lib/qr'

/** v50: public QR section — renders nothing unless the admin turned on "Show QR codes on website". */
export default function QrPublicSection() {
  const [cfg, setCfg] = useState<QrCodesSetting | null>(null)
  const [imgs, setImgs] = useState<Partial<Record<QrKind, string>>>({})
  useEffect(() => {
    void getQrCodes().then(async (c) => {
      setCfg(c)
      if (!c.show_on_site) return
      const ks = (['free', 'paid'] as QrKind[]).filter((k) => c[k].enabled && !c[k].hidden)
      setImgs(Object.fromEntries(await Promise.all(ks.map(async (k) => [k, await qrDataUrl(k, 360)] as const))))
    })
  }, [])
  if (!cfg?.show_on_site) return null
  const kinds = (['free', 'paid'] as QrKind[]).filter((k) => cfg[k].enabled && !cfg[k].hidden)
  if (!kinds.length) return null
  return (
    <section className="how qr-public" id="qr">
      <h2 className="section-title">Scan to list your home</h2>
      <div className="qr-grid">
        {kinds.map((k) => (
          <div key={k} className="qr-card">
            <span className={`badge qr-${k}`}>{qrBadge(k, cfg[k].label)}</span>
            {imgs[k] ? <img className="qr-img" src={imgs[k]} alt={`${QR_TITLE[k]} QR code`} width={180} height={180} /> : <div className="qr-img" />}
            <Link className="btn secondary bulk-sm" to={k === 'free' ? '/list?plan=free&src=qr' : '/list?src=qr-paid'}>
              {k === 'free' ? 'Open the free form' : 'Open the form'}
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
