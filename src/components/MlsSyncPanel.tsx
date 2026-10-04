import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ConfirmDeleteAll, Modal } from './AdminModal'
import {
  deleteAllImportLog,
  deleteImportLog,
  getSyncSettings,
  listImportLog,
  runMlsSync,
  setSyncEnabled,
  setSyncLink,
  SYNC_CODE_KEY,
  updateImportLog,
  type ImportLogRow,
  type SyncRunResult,
  type SyncSettings,
} from '../lib/mlsSync'

function readCode(): string {
  try {
    return localStorage.getItem(SYNC_CODE_KEY) || ''
  } catch {
    return ''
  }
}

function fmt(ts: string | null | undefined) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function maskLink(link: string | null) {
  const m = link ? /D=([A-Za-z0-9]+)/.exec(link) : null
  return m ? `…D=${m[1].slice(0, 4)}…${m[1].slice(-4)}` : null
}

/**
 * v40 admin panel: automatic MLS import from the SMART MLS email link.
 * On/off switch, saved link (secret, token-gated), Run now (dry run / real), and the import log with Edit / Delete / Delete all.
 */
export default function MlsSyncPanel({ onImported }: { onImported: () => void | Promise<void> }) {
  const [code, setCode] = useState(readCode)
  const [codeInput, setCodeInput] = useState('')
  const [settings, setSettings] = useState<SyncSettings | null>(null)
  const [log, setLog] = useState<ImportLogRow[]>([])
  const [linkInput, setLinkInput] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [result, setResult] = useState<(SyncRunResult & { at: number }) | null>(null)
  const [editing, setEditing] = useState<ImportLogRow | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editNote, setEditNote] = useState('')
  const [confirmAll, setConfirmAll] = useState(false)

  const load = useCallback(async (c: string): Promise<boolean> => {
    setErr('')
    try {
      const [s, l] = await Promise.all([getSyncSettings(c), listImportLog(c)])
      setSettings(s)
      setLog(l)
      return true
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load')
      setSettings(null)
      return false
    }
  }, [])

  useEffect(() => {
    if (code) void load(code)
  }, [code, load])

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    const c = codeInput.trim().toUpperCase()
    if (!c) return
    if (await load(c)) {
      try {
        localStorage.setItem(SYNC_CODE_KEY, c)
      } catch {
        /* session only */
      }
      setCode(c)
      setCodeInput('')
    }
  }

  function forget() {
    try {
      localStorage.removeItem(SYNC_CODE_KEY)
    } catch {
      /* ignore */
    }
    setCode('')
    setSettings(null)
    setLog([])
  }

  async function run<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(name)
    setErr('')
    setMsg('')
    try {
      return await fn()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy('')
    }
  }

  const toggle = (enabled: boolean) =>
    run('switch', async () => {
      const s = await setSyncEnabled(code, enabled)
      setSettings(s)
      setMsg(enabled ? 'Automatic MLS import is ON.' : 'Automatic MLS import is OFF (scheduled runs will do nothing; Run now still works).')
    })

  const saveLink = () =>
    run('link', async () => {
      const s = await setSyncLink(code, linkInput)
      setSettings(s)
      setLinkInput('')
      setMsg(s.link ? 'Saved the MLS link.' : 'Cleared the saved MLS link.')
    })

  const runNow = (dry: boolean) =>
    run(dry ? 'dry' : 'real', async () => {
      const r = await runMlsSync(code, dry)
      setResult({ ...r, at: Date.now() })
      setLog(await listImportLog(code))
      setSettings(await getSyncSettings(code))
      if (!dry && !r.skipped) await onImported()
    })

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    await run('edit', async () => {
      const row = await updateImportLog(code, editing.id, editLabel, editNote)
      setLog((prev) => prev.map((x) => (x.id === row.id ? row : x)))
      setEditing(null)
    })
  }

  const removeOne = (r: ImportLogRow) =>
    run('del' + r.id, async () => {
      if (!window.confirm(`Delete this log entry (${fmt(r.created_at)})? The listings themselves are not touched.`)) return
      await deleteImportLog(code, r.id)
      setLog((prev) => prev.filter((x) => x.id !== r.id))
    })

  const removeAll = () =>
    run('delall', async () => {
      const n = await deleteAllImportLog(code)
      setLog([])
      setConfirmAll(false)
      setMsg(`Deleted ${n} log entr${n === 1 ? 'y' : 'ies'}. Listings were not touched.`)
    })

  if (!code || !settings) {
    return (
      <section className="card" id="mls-sync">
        <div className="body" style={{ display: 'grid', gap: '.75rem' }}>
          <h2 style={{ margin: 0 }}>Automatic MLS import</h2>
          <p className="meta" style={{ margin: 0 }}>
            Imports your SMART MLS email matches automatically. Enter the sync access code (or the CMA leads access code) once; this browser remembers it.
          </p>
          <form onSubmit={submitCode} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
              aria-label="Sync access code"
              autoComplete="off"
              spellCheck={false}
              style={{ minWidth: '18rem' }}
            />
            <button className="btn" type="submit">
              Unlock
            </button>
          </form>
          {err ? <div className="error">{err}</div> : null}
        </div>
      </section>
    )
  }

  const last = settings.last_result as Record<string, unknown> | null
  const linkMasked = maskLink(settings.link)

  return (
    <section className="card" id="mls-sync">
      <div className="body" style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>Automatic MLS import</h2>
            <p className="meta" style={{ margin: 0 }}>
              Adds new homes and refreshes price / status / photos of existing ones by MLS number. Never duplicates, never removes homes. New homes expire per the MLS auto-expire setting.
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={forget} title="Remove the saved access code from this browser">
            Forget code
          </button>
        </div>

        {msg ? <div className="success">{msg}</div> : null}
        {err ? <div className="error">{err}</div> : null}

        <div className="bulk-setting">
          <label className="bulk-check">
            <input type="checkbox" checked={settings.enabled} disabled={busy === 'switch'} onChange={(e) => void toggle(e.target.checked)} />
            <span>Automatic import is {settings.enabled ? 'ON' : 'OFF'}</span>
          </label>
          <span className="meta">
            Last run: {fmt(settings.last_run_at)}
            {last ? ` — ${String(last.new ?? 0)} new, ${String(last.updated ?? 0)} updated (${last.dry ? 'dry run' : 'real'})` : ''}
          </span>
        </div>

        <div className="bulk-setting">
          <span>
            <strong>MLS link</strong> {linkMasked ? <>saved ({linkMasked})</> : <em>none saved</em>}
          </span>
          <input
            type="text"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="Paste https://smartmls.connectmls.com/servlet/QL?D=…"
            aria-label="MLS portal link"
            autoComplete="off"
            spellCheck={false}
            style={{ minWidth: '22rem', flex: '1 1 22rem' }}
          />
          <button type="button" className="btn secondary" disabled={!linkInput.trim() || busy === 'link'} onClick={() => void saveLink()}>
            {busy === 'link' ? 'Saving…' : 'Save link'}
          </button>
        </div>

        <div className="bulk-setting">
          <strong>Run now</strong>
          <button type="button" className="btn secondary" disabled={!settings.link || !!busy} onClick={() => void runNow(true)}>
            {busy === 'dry' ? 'Checking…' : 'Dry run (preview only)'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!settings.link || !!busy}
            onClick={() => {
              if (window.confirm('Import now? New homes are added and existing homes get fresh price/status/photos. Nothing is removed.')) void runNow(false)
            }}
          >
            {busy === 'real' ? 'Importing…' : 'Import now (real)'}
          </button>
          {result ? (
            <span className="bulk-result" role="status">
              {result.skipped
                ? 'Skipped — switch is OFF.'
                : `${result.dry ? 'Dry run: ' : ''}${result.summary ?? ''} · ${result.unchanged ?? 0} unchanged · ${result.notSeen ?? 0} not seen · ${result.errors ?? 0} errors`}
            </span>
          ) : null}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Import log ({log.length})</h3>
            <button type="button" className="btn danger" disabled={!log.length} onClick={() => setConfirmAll(true)}>
              Delete all
            </button>
          </div>
          {log.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>When (ET)</th>
                    <th>Mode</th>
                    <th>Source</th>
                    <th>New</th>
                    <th>Updated</th>
                    <th>Unchanged</th>
                    <th>Not seen</th>
                    <th>Errors</th>
                    <th>Label / note</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((r) => (
                    <tr key={r.id}>
                      <td>{fmt(r.created_at)}</td>
                      <td>{r.mode === 'dry' ? 'dry run' : 'real'}</td>
                      <td>{r.source}</td>
                      <td>{r.new_count}</td>
                      <td>{r.updated_count}</td>
                      <td>{r.unchanged_count}</td>
                      <td>{r.not_seen_count}</td>
                      <td>{r.error_count}</td>
                      <td>
                        {r.label ? <strong>{r.label}</strong> : null} {r.note ?? ''}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn secondary bulk-sm"
                            onClick={() => {
                              setEditing(r)
                              setEditLabel(r.label ?? '')
                              setEditNote(r.note ?? '')
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" className="btn danger bulk-sm" disabled={busy === 'del' + r.id} onClick={() => void removeOne(r)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="meta">No imports yet.</p>
          )}
        </div>
      </div>

      {editing ? (
        <Modal title="Edit log entry" onClose={() => setEditing(null)}>
          <form className="modal-body" onSubmit={saveEdit}>
            <label>
              Label
              <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} maxLength={80} placeholder="e.g. First full import" />
            </label>
            <label>
              Note
              <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={3} />
            </label>
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
          title={`Delete all ${log.length} log entries`}
          message={<>This deletes the whole import log. Listings are not touched.</>}
          busy={busy === 'delall'}
          onConfirm={removeAll}
          onCancel={() => setConfirmAll(false)}
        />
      ) : null}
    </section>
  )
}
