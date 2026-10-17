import { useEffect, useState, type FormEvent } from 'react'
import { ConfirmDeleteAll, Modal } from './AdminModal'
import { DEFAULT_QR, getQrCodes, QR_URLS, saveQrCodes, type QrCodesSetting, type QrKind } from '../lib/store'
import { downloadDataUrl, qrCardPng, qrDataUrl, QR_TITLE } from '../lib/qr'

const KINDS: QrKind[] = ['free', 'paid']
const WHAT: Record<QrKind, string> = {
  free: 'Opens the list form in free mode — the listing goes live with no payment (only while this is On).',
  paid: 'Opens the list form in the normal paid flow (Stripe: $99 rent / $800 sale).',
}

/** v50 admin: QR codes for flyers and yard signs. On/Off, Download PNG, Print, Edit, Delete (= off + hidden), Delete all. */
export default function QrCodesPanel() {
  const [cfg, setCfg] = useState<QrCodesSetting | null>(null)
  const [imgs, setImgs] = useState<Partial<Record<QrKind, string>>>({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<QrKind | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editCap, setEditCap] = useState('25')
  const [confirmAll, setConfirmAll] = useState(false)

  useEffect(() => {
    void getQrCodes().then(setCfg)
    void Promise.all(KINDS.map(async (k) => [k, await qrDataUrl(k, 360)] as const)).then((e) => setImgs(Object.fromEntries(e)))
  }, [])

  async function save(next: QrCodesSetting, note: string, key: string) {
    setBusy(key)
    setErr('')
    setMsg('')
    try {
      setCfg(await saveQrCodes(next))
      setMsg(note)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy('')
    }
  }

  if (!cfg) return null
  const set = (k: QrKind, patch: Partial<QrCodesSetting[QrKind]>) => ({ ...cfg, [k]: { ...cfg[k], ...patch } })
  const visible = KINDS.filter((k) => !cfg[k].hidden)
  const hidden = KINDS.filter((k) => cfg[k].hidden)

  async function download(k: QrKind) {
    setBusy('dl' + k)
    try {
      downloadDataUrl(await qrCardPng(k, cfg![k].label), `listingneeded-qr-${k}.png`)
    } finally {
      setBusy('')
    }
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const cap = Math.max(1, Math.min(1000, Math.round(Number(editCap) || 25)))
    void save(set(editing, { label: editLabel.trim() || DEFAULT_QR[editing].label, ...(editing === 'free' ? { daily_cap: cap } : {}) }), 'Saved.', 'edit').then(() =>
      setEditing(null),
    )
  }

  return (
    <section className="card" id="qr-codes">
      <div className="body" style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>QR codes (flyers &amp; yard signs)</h2>
            <p className="meta" style={{ margin: 0 }}>
              Each code opens the “List your home” form. When a code is Off, scanning it shows “not active right now” with a link to the normal list page.
            </p>
          </div>
          <button type="button" className="btn danger" disabled={!visible.length} onClick={() => setConfirmAll(true)}>
            Delete all
          </button>
        </div>
        {msg ? <div className="success">{msg}</div> : null}
        {err ? <div className="error">{err}</div> : null}

        <div className="qr-grid">
          {visible.map((k) => (
            <div key={k} className={`qr-card ${cfg[k].enabled ? 'on' : 'off'}`}>
              <div className="qr-card-head">
                <span className={`badge qr-${k}`}>{QR_TITLE[k]}</span>
                <strong>{cfg[k].label}</strong>
                <label className="bulk-check qr-switch">
                  <input
                    type="checkbox"
                    checked={cfg[k].enabled}
                    disabled={busy === 'sw' + k}
                    onChange={(e) =>
                      void save(set(k, { enabled: e.target.checked }), `${QR_TITLE[k]} QR is now ${e.target.checked ? 'ON' : 'OFF'}.`, 'sw' + k)
                    }
                  />
                  <span>{cfg[k].enabled ? 'On' : 'Off'}</span>
                </label>
              </div>
              {imgs[k] ? <img className="qr-img" src={imgs[k]} alt={`${QR_TITLE[k]} QR code`} width={180} height={180} /> : <div className="qr-img" />}
              <p className="meta qr-what">{WHAT[k]}</p>
              <code className="qr-url">{QR_URLS[k]}</code>
              {k === 'free' ? <p className="meta" style={{ margin: 0 }}>Limit: {cfg.free.daily_cap ?? 25} free listings per 24 h.</p> : null}
              <div className="row-actions">
                <button type="button" className="btn bulk-sm" disabled={busy === 'dl' + k} onClick={() => void download(k)}>
                  Download PNG
                </button>
                <a className="btn secondary bulk-sm" href={`/#/qr/${k}`} target="_blank" rel="noopener">
                  Print
                </a>
                <button
                  type="button"
                  className="btn secondary bulk-sm"
                  onClick={() => {
                    setEditing(k)
                    setEditLabel(cfg[k].label)
                    setEditCap(String(cfg.free.daily_cap ?? 25))
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn danger bulk-sm"
                  disabled={busy === 'del' + k}
                  onClick={() => {
                    if (window.confirm(`Delete the ${QR_TITLE[k]} QR? It is turned off and hidden here; printed codes will show “not active right now”. You can restore it.`))
                      void save(set(k, { enabled: false, hidden: true }), `${QR_TITLE[k]} QR deleted (off and hidden).`, 'del' + k)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        {hidden.length ? (
          <p className="meta" style={{ margin: 0 }}>
            Deleted:{' '}
            {hidden.map((k) => (
              <button key={k} type="button" className="link-btn" style={{ marginRight: '.75rem' }} onClick={() => void save(set(k, { hidden: false }), `${QR_TITLE[k]} QR restored (still Off).`, 'rs' + k)}>
                Restore {QR_TITLE[k]} QR
              </button>
            ))}
          </p>
        ) : null}
      </div>

      {editing ? (
        <Modal title={`Edit ${QR_TITLE[editing]} QR`} onClose={() => setEditing(null)}>
          <form className="modal-body" onSubmit={saveEdit}>
            <label>
              Label (shown on the printed code)
              <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} maxLength={40} />
            </label>
            {editing === 'free' ? (
              <label>
                Max free listings per 24 hours
                <input type="number" min={1} max={1000} value={editCap} onChange={(e) => setEditCap(e.target.value)} />
              </label>
            ) : null}
            <p className="meta" style={{ margin: 0 }}>The link inside the code never changes, so printed flyers keep working.</p>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy === 'edit'}>
                {busy === 'edit' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {confirmAll ? (
        <ConfirmDeleteAll
          title="Delete both QR codes"
          message={<>Both codes are turned off and hidden. Printed codes will show “not active right now”. You can restore them.</>}
          busy={busy === 'all'}
          onConfirm={() =>
            void save(
              { free: { ...cfg.free, enabled: false, hidden: true }, paid: { ...cfg.paid, enabled: false, hidden: true } },
              'Both QR codes deleted (off and hidden).',
              'all',
            ).then(() => setConfirmAll(false))
          }
          onCancel={() => setConfirmAll(false)}
        />
      ) : null}
    </section>
  )
}
