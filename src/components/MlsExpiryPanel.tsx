import { useEffect, useMemo, useState } from 'react'
import type { Listing } from '../lib/types'
import {
  applyExpiryToMlsWithoutEndDate,
  DEFAULT_MLS_EXPIRY,
  getMlsExpiry,
  getPaidTerm,
  saveMlsExpiry,
  savePaidTerm,
  trashListings,
  TRASH_DAYS,
} from '../lib/store'
import { ConfirmDeleteAll } from './AdminModal'

/**
 * v38 admin panel: "MLS listings expire after N days" setting, one-click end dates for existing MLS rows,
 * and "Delete MLS older than X days" (moves to Trash, restorable for 7 days).
 */
export default function MlsExpiryPanel({
  listings,
  onChanged,
  onStatus,
  onError,
}: {
  listings: Listing[]
  onChanged: () => void | Promise<void>
  onStatus: (m: string) => void
  onError: (m: string) => void
}) {
  const [enabled, setEnabled] = useState(DEFAULT_MLS_EXPIRY.enabled)
  const [days, setDays] = useState(String(DEFAULT_MLS_EXPIRY.days))
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [paidDays, setPaidDays] = useState('90')
  const [savingPaid, setSavingPaid] = useState(false)
  const [olderDays, setOlderDays] = useState('90')
  const [confirmOlder, setConfirmOlder] = useState(false)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let off = false
    void getMlsExpiry(true).then((s) => {
      if (off) return
      setEnabled(s.enabled)
      setDays(String(s.days))
      setLoaded(true)
    })
    return () => {
      off = true
    }
  }, [])

  useEffect(() => {
    let off = false
    void getPaidTerm(true).then((t) => {
      if (!off) setPaidDays(String(t.days))
    })
    return () => {
      off = true
    }
  }, [])

  const paidN = Math.round(Number(paidDays))
  const paidOk = Number.isFinite(paidN) && paidN >= 1 && paidN <= 3650

  async function savePaid() {
    if (!paidOk) return onError('Enter a number of days between 1 and 3650.')
    setSavingPaid(true)
    try {
      const t = await savePaidTerm({ days: paidN })
      onStatus(`Saved: paid DIY listings stay live ${t.days} days from the payment date (applies to new payments and renewals).`)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save the setting')
    } finally {
      setSavingPaid(false)
    }
  }

  const noEnd = useMemo(() => listings.filter((l) => l.is_mls && !l.activeUntil && !l.deletedAt).length, [listings])
  const olderN = Math.max(0, Math.round(Number(olderDays) || 0))
  const olderIds = useMemo(() => {
    if (!olderN) return []
    const cutoff = Date.now() - olderN * 86_400_000
    return listings
      .filter((l) => l.is_mls && !l.deletedAt && new Date(l.createdAt).getTime() < cutoff)
      .map((l) => l.id)
  }, [listings, olderN])

  const daysN = Math.round(Number(days))
  const daysOk = Number.isFinite(daysN) && daysN >= 1 && daysN <= 3650

  async function save() {
    if (!daysOk) return onError('Enter a number of days between 1 and 3650.')
    setSaving(true)
    try {
      const s = await saveMlsExpiry({ enabled, days: daysN })
      onStatus(
        s.enabled
          ? `Saved: new MLS imports expire ${s.days} days after import.`
          : 'Saved: MLS auto-expire is OFF (imports keep no end date unless you set one).',
      )
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save the setting')
    } finally {
      setSaving(false)
    }
  }

  async function applyExisting() {
    if (!daysOk) return onError('Enter a valid number of days first.')
    if (!confirm(`Give ${noEnd} MLS listing(s) with no end date an end date of today + ${daysN} days? They will drop off Search after that.`)) return
    setWorking(true)
    try {
      const n = await applyExpiryToMlsWithoutEndDate(daysN)
      onStatus(`Set an end date (today + ${daysN} days) on ${n} MLS listing(s).`)
      await onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not apply expiry')
    } finally {
      setWorking(false)
    }
  }

  async function moveOlder() {
    setWorking(true)
    try {
      const n = await trashListings(olderIds)
      onStatus(`Moved ${n} MLS listing(s) older than ${olderN} days to Trash. Restore them within ${TRASH_DAYS} days if needed.`)
      setConfirmOlder(false)
      await onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not move to Trash')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="card" id="mls-expiry">
      <div className="body" style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: '0 0 .35rem' }}>MLS auto-expire &amp; cleanup</h2>
          <p className="meta" style={{ margin: 0 }}>
            Expired listings disappear from public Search automatically. Deleted listings go to Trash for {TRASH_DAYS} days first.
          </p>
        </div>

        <div className="bulk-setting">
          <label className="bulk-check">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!loaded} />
            <span>MLS listings expire after</span>
          </label>
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="bulk-num"
            aria-label="Days until MLS listings expire"
            disabled={!loaded}
          />
          <span>days</span>
          <button type="button" className="btn secondary" onClick={() => void save()} disabled={saving || !loaded}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span className="meta">{enabled ? 'ON — imports without an end date get import date + N days.' : 'OFF'}</span>
        </div>

        <div className="bulk-setting">
          <span>
            <strong>Paid DIY listings</strong> stay live
          </span>
          <input
            type="number"
            min={1}
            max={3650}
            value={paidDays}
            onChange={(e) => setPaidDays(e.target.value)}
            className="bulk-num"
            aria-label="Days a paid DIY listing stays live"
          />
          <span>days from the payment date</span>
          <button type="button" className="btn secondary" onClick={() => void savePaid()} disabled={savingPaid}>
            {savingPaid ? 'Saving…' : 'Save'}
          </button>
          <span className="meta">MLS auto-expire above does not apply to DIY / paid listings.</span>
        </div>

        <div className="bulk-setting">
          <span>
            <strong>{noEnd}</strong> existing MLS listing(s) have no end date.
          </span>
          <button type="button" className="btn secondary" onClick={() => void applyExisting()} disabled={working || noEnd === 0 || !daysOk}>
            Set end date to today + {daysOk ? daysN : 'N'} days
          </button>
        </div>

        <div className="bulk-setting">
          <span>Delete MLS listings imported more than</span>
          <input
            type="number"
            min={1}
            value={olderDays}
            onChange={(e) => setOlderDays(e.target.value)}
            className="bulk-num"
            aria-label="Delete MLS listings older than this many days"
          />
          <span>days ago</span>
          <span className="bulk-preview">
            Preview: <strong>{olderIds.length}</strong> listing(s)
          </span>
          <button type="button" className="btn danger" disabled={working || olderIds.length === 0} onClick={() => setConfirmOlder(true)}>
            Move {olderIds.length} to Trash…
          </button>
        </div>
      </div>

      {confirmOlder ? (
        <ConfirmDeleteAll
          title={`Move ${olderIds.length} to Trash`}
          message={
            <>
              This moves <strong>{olderIds.length}</strong> MLS listing(s) imported more than <strong>{olderN}</strong> days ago to the Trash.
              You can restore them for {TRASH_DAYS} days; after that they are removed for good. DIY listings are not touched.
            </>
          }
          busy={working}
          onConfirm={moveOlder}
          onCancel={() => setConfirmOlder(false)}
        />
      ) : null}
    </section>
  )
}
