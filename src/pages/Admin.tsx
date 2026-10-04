import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Listing, ListingType, PartnerCategory, PartnerLink } from '../lib/types'
import { isActiveUntilOk, MLS_OWNER, PARTNER_CATEGORY_LABELS } from '../lib/types'
import {
  addDaysYmd,
  allListings,
  todayYmd,
  allPartnerLinks,
  deleteAllDiyListings,
  deleteAllMlsListings,
  deleteAllPartnerLinks,
  deleteListing,
  deleteListingsPermanently,
  deletePartnerLink,
  emptyTrash,
  extendListings,
  purgeOldTrash,
  restoreListings,
  setListingsLive,
  trashListings,
  TRASH_DAYS,
  insertListing,
  insertListings,
  insertPartnerLink,
  updateListing,
  updatePartnerLink,
  upsertListings,
} from '../lib/store'
import { parseMlsPasteText, uploadMlsPdf, type MlsDraft } from '../lib/pdfMls'
import { parseMlsSpreadsheet } from '../lib/excelMls'
import { importMlsSharedLink } from '../lib/importMlsLink'
import { useSearchParams } from 'react-router-dom'
import CmaLeadsPanel from '../components/CmaLeadsPanel'
import MlsSyncPanel from '../components/MlsSyncPanel'
import { ConfirmDeleteAll } from '../components/AdminModal'
import { ListingEditModal, PartnerEditModal } from '../components/AdminEditors'
import MlsExpiryPanel from '../components/MlsExpiryPanel'

const SESSION_KEY = 'listingneeded_admin_ok'
const CATEGORIES = Object.keys(PARTNER_CATEGORY_LABELS) as PartnerCategory[]

function visibleCount(rows: unknown[], limit: number): number {
  return Math.min(rows.length, limit)
}

function trashDaysLeft(deletedAt: string | null | undefined): number {
  if (!deletedAt) return 0
  const left = 7 - (Date.now() - new Date(deletedAt).getTime()) / 86_400_000
  return Math.max(0, Math.ceil(left))
}

function uid() {
  return `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function setUnlocked(value: boolean) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, '1')
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

function formatPrice(l: Listing): string {
  const n = l.price.toLocaleString()
  return l.type === 'rent' ? `$${n}/mo` : `$${n}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function statusLabel(l: Listing): string {
  const expired = !isActiveUntilOk(l.activeUntil)
  if (expired) return 'ended'
  if (l.live && l.paid) return 'active'
  if (l.live) return 'live (unpaid)'
  return 'inactive'
}

type ListingFilter = 'all' | 'mls' | 'diy' | 'live' | 'inactive' | 'ending' | 'trash'
const LISTING_FILTERS: { key: ListingFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mls', label: 'MLS' },
  { key: 'diy', label: 'DIY' },
  { key: 'live', label: 'Live' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'ending', label: 'Ending ≤ 7 days' },
  { key: 'trash', label: 'Trash' },
]
const PAGE_SIZE = 50

/** Live = switched on and not past its end date. Inactive = switched off or ended. */
/** Paid, live listing whose end date falls within the next 7 days (today included). */
function endsWithin7Days(l: Listing): boolean {
  if (!l.paid || !l.live || l.deletedAt || !l.activeUntil) return false
  const end = l.activeUntil.slice(0, 10)
  const today = todayYmd()
  return end >= today && end <= addDaysYmd(today, 7)
}

function isLiveNow(l: Listing): boolean {
  return l.live && isActiveUntilOk(l.activeUntil)
}

/** Everything the admin can type into the search box, lower-cased once per listing. */
function searchHaystack(l: Listing): string {
  const mlsNo = l.id.replace(/^mls_/i, '')
  return [
    l.address, l.city, l.state, l.zip, l.id, mlsNo, l.ownerName, l.ownerPhone,
    l.ownerPhone.replace(/\D/g, ''), l.ownerEmail, l.type, l.type === 'sale' ? 'for sale' : 'for rent',
  ].join(' \u0001 ').toLowerCase()
}

type LinkForm = {
  title: string
  url: string
  category: PartnerCategory
  blurb: string
  sortOrder: string
  enabled: boolean
}

const emptyForm = (): LinkForm => ({
  title: '',
  url: '',
  category: 'mortgage',
  blurb: '',
  sortOrder: '0',
  enabled: true,
})

type AddForm = {
  type: ListingType
  address: string
  city: string
  state: string
  zip: string
  beds: string
  baths: string
  price: string
  pets: Listing['pets']
  description: string
  activeUntil: string
  live: boolean
}

const emptyAddForm = (): AddForm => ({
  type: 'sale',
  address: '',
  city: 'Fairfield',
  state: 'CT',
  zip: '',
  beds: '3',
  baths: '2',
  price: '',
  pets: 'no',
  description: '',
  activeUntil: '',
  live: true,
})

export default function Admin() {
  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined
  const [unlocked, setUnlockedState] = useState(false)
  const [password, setPassword] = useState('')
  const [gateError, setGateError] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [links, setLinks] = useState<PartnerLink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [partnerSetupError, setPartnerSetupError] = useState('')
  const [status, setStatus] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editListing, setEditListing] = useState<Listing | null>(null)
  const [editLink, setEditLink] = useState<PartnerLink | null>(null)
  const [confirmDiy, setConfirmDiy] = useState(false)
  const [removingDiy, setRemovingDiy] = useState(false)
  const [confirmLinks, setConfirmLinks] = useState(false)
  const [removingLinks, setRemovingLinks] = useState(false)
  const [form, setForm] = useState<LinkForm>(emptyForm())
  const [savingLink, setSavingLink] = useState(false)
  const [addForm, setAddForm] = useState<AddForm>(emptyAddForm())
  const [savingAdd, setSavingAdd] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfDrafts, setPdfDrafts] = useState<MlsDraft[]>([])
  const [pdfName, setPdfName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [mlsLinkUrl, setMlsLinkUrl] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [removingMls, setRemovingMls] = useState(false)
  const [publishProgress, setPublishProgress] = useState('')
  const [listingQuery, setListingQuery] = useState('')
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all')
  const [listingLimit, setListingLimit] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState('')
  const [extendDays, setExtendDays] = useState('30')
  const [confirmBulkTrash, setConfirmBulkTrash] = useState(false)
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false)
  const [confirmPermanent, setConfirmPermanent] = useState(false)
  const [endDateDrafts, setEndDateDrafts] = useState<Record<string, string>>({})
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'leads' ? 'leads' : 'listings'

  const deferredQuery = useDeferredValue(listingQuery)
  const haystacks = useMemo(() => new Map(listings.map((l) => [l.id, searchHaystack(l)])), [listings])
  const filteredListings = useMemo(() => {
    const terms = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean)
    const out = listings.filter((l) => {
      if (listingFilter === 'trash') {
        if (!l.deletedAt) return false
      } else {
        if (l.deletedAt) return false
        if (listingFilter === 'mls' && !l.is_mls) return false
        if (listingFilter === 'diy' && l.is_mls) return false
        if (listingFilter === 'live' && !isLiveNow(l)) return false
        if (listingFilter === 'inactive' && isLiveNow(l)) return false
        if (listingFilter === 'ending' && !endsWithin7Days(l)) return false
      }
      if (!terms.length) return true
      const hay = haystacks.get(l.id) ?? ''
      return terms.every((t) => hay.includes(t))
    })
    if (listingFilter === 'ending') out.sort((a, b) => (a.activeUntil ?? '').localeCompare(b.activeUntil ?? ''))
    return out
  }, [listings, haystacks, deferredQuery, listingFilter])
  const filterCounts = useMemo(() => {
    const c: Record<ListingFilter, number> = { all: 0, mls: 0, diy: 0, live: 0, inactive: 0, ending: 0, trash: 0 }
    for (const l of listings) {
      if (l.deletedAt) {
        c.trash++
        continue
      }
      c.all++
      if (l.is_mls) c.mls++
      else c.diy++
      if (isLiveNow(l)) c.live++
      else c.inactive++
      if (endsWithin7Days(l)) c.ending++
    }
    return c
  }, [listings])
  const inTrash = listingFilter === 'trash'
  const poolSize = inTrash ? filterCounts.trash : filterCounts.all
  const allVisibleSelected = visibleCount(filteredListings, listingLimit) > 0 && filteredListings.slice(0, listingLimit).every((l) => selected.has(l.id))
  const visibleListings = filteredListings.slice(0, listingLimit)
  const listingFiltersActive = listingQuery.trim() !== '' || listingFilter !== 'all'

  useEffect(() => {
    setUnlockedState(isUnlocked())
  }, [])

  useEffect(() => {
    if (!unlocked) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      setPartnerSetupError('')
      try {
        try {
          await purgeOldTrash()
        } catch {
          /* the daily pg_cron job also purges */
        }
        const rows = await allListings()
        if (!cancelled) {
          setListings(rows)
          const dates: Record<string, string> = {}
          for (const r of rows) {
            dates[r.id] = r.activeUntil?.slice(0, 10) ?? ''
          }
          setEndDateDrafts(dates)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load listings')
      } finally {
        if (!cancelled) setLoading(false)
      }
      try {
        const partnerRows = await allPartnerLinks()
        if (!cancelled) setLinks(partnerRows)
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load partner links'
          if (msg.includes('partner_links') || msg.includes('PGRST205')) {
            setPartnerSetupError(
              'Partner links table is missing. Run the partner_links SQL in Supabase (listingneeded project), then refresh.',
            )
          } else {
            setPartnerSetupError(msg)
          }
          setLinks([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [unlocked])

  function handleUnlock(e: FormEvent) {
    e.preventDefault()
    setGateError('')
    if (!adminPassword) {
      setGateError('Set VITE_ADMIN_PASSWORD in the environment, then rebuild/redeploy.')
      return
    }
    if (password !== adminPassword) {
      setGateError('Wrong password.')
      return
    }
    setUnlocked(true)
    setUnlockedState(true)
    setPassword('')
  }

  function handleLock() {
    setUnlocked(false)
    setUnlockedState(false)
    setListings([])
    setLinks([])
    setStatus('')
    setPdfDrafts([])
    setPdfName('')
    setPasteText('')
    setPublishProgress('')
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this listing? Will try hard delete, then soft-delete (live/paid false).')) {
      return
    }
    setBusyId(id)
    setStatus('')
    setError('')
    try {
      const mode = await deleteListing(id)
      setListings((prev) => prev.filter((l) => l.id !== id))
      setStatus(
        mode === 'hard'
          ? `Hard-deleted listing ${id}.`
          : `Soft-deleted listing ${id} (live=false, paid=false).`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }


  async function handleRemoveAllMls() {
    const mlsCount = listings.filter((l) => l.is_mls).length
    if (mlsCount === 0) {
      setStatus('No MLS listings to remove.')
      return
    }
    if (
      !confirm(
        `Remove ALL ${mlsCount} MLS listing(s)? DIY / non-MLS listings will stay. This cannot be undone.`,
      )
    ) {
      return
    }
    setRemovingMls(true)
    setStatus('')
    setError('')
    try {
      const { mode, deleted } = await deleteAllMlsListings()
      const rows = await allListings()
      setListings(rows)
      const dates: Record<string, string> = {}
      for (const r of rows) {
        dates[r.id] = r.activeUntil?.slice(0, 10) ?? ''
      }
      setEndDateDrafts(dates)
      const how =
        mode === 'hard' ? 'hard-deleted' : mode === 'soft' ? 'soft-deleted' : 'removed (mixed hard/soft)'
      setStatus(`${how} ${deleted} MLS listing(s). DIY listings untouched.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove all MLS failed')
    } finally {
      setRemovingMls(false)
    }
  }

  async function handleRemoveAllDiy() {
    setRemovingDiy(true)
    setStatus('')
    setError('')
    try {
      const { mode, deleted } = await deleteAllDiyListings()
      const rows = await allListings()
      setListings(rows)
      const dates: Record<string, string> = {}
      for (const r of rows) dates[r.id] = r.activeUntil?.slice(0, 10) ?? ''
      setEndDateDrafts(dates)
      setStatus(`${mode === 'hard' ? 'Deleted' : 'Soft-deleted'} ${deleted} DIY listing(s). MLS listings untouched.`)
      setConfirmDiy(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete all DIY failed')
    } finally {
      setRemovingDiy(false)
    }
  }

  async function handleRemoveAllLinks() {
    setRemovingLinks(true)
    setStatus('')
    setError('')
    try {
      const n = await deleteAllPartnerLinks()
      setLinks([])
      setStatus(`Deleted ${n} partner link(s).`)
      setConfirmLinks(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete all partner links failed')
    } finally {
      setRemovingLinks(false)
    }
  }

  async function reloadListings() {
    const rows = await allListings()
    setListings(rows)
    const dates: Record<string, string> = {}
    for (const r of rows) dates[r.id] = r.activeUntil?.slice(0, 10) ?? ''
    setEndDateDrafts(dates)
    setSelected(new Set())
  }

  function patchLocal(ids: string[], patch: Partial<Listing>) {
    const set = new Set(ids)
    setListings((prev) => prev.map((row) => (set.has(row.id) ? { ...row, ...patch } : row)))
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleVisible() {
    const vis = filteredListings.slice(0, listingLimit)
    setSelected((prev) => {
      const next = new Set(prev)
      if (vis.every((l) => next.has(l.id))) vis.forEach((l) => next.delete(l.id))
      else vis.forEach((l) => next.add(l.id))
      return next
    })
  }

  function selectAllMatching() {
    setSelected(new Set(filteredListings.map((l) => l.id)))
  }

  async function runBulk(label: string, fn: (ids: string[]) => Promise<string>) {
    const ids = [...selected]
    if (!ids.length) return
    setBulkBusy(label)
    setStatus('')
    setError('')
    try {
      const msg = await fn(ids)
      setStatus(msg)
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed`)
      // something may have been applied before the error — resync from the database
      try {
        await reloadListings()
      } catch {
        /* keep the error above */
      }
    } finally {
      setBulkBusy('')
    }
  }

  const bulkTrash = () =>
    runBulk('Move to Trash', async (ids) => {
      const n = await trashListings(ids, (d) => setBulkBusy(`Moving to Trash… ${d}/${ids.length}`))
      patchLocal(ids, { deletedAt: new Date().toISOString() })
      setConfirmBulkTrash(false)
      return `Moved ${n} listing(s) to Trash. Restore them within ${TRASH_DAYS} days from the Trash view.`
    })

  const bulkLive = (live: boolean) =>
    runBulk(live ? 'Activate' : 'Deactivate', async (ids) => {
      const n = await setListingsLive(ids, live, (d) => setBulkBusy(`${live ? 'Activating' : 'Deactivating'}… ${d}/${ids.length}`))
      patchLocal(ids, live ? { live: true, paid: true } : { live: false })
      return `${live ? 'Activated' : 'Deactivated'} ${n} listing(s).`
    })

  const bulkExtend = () => {
    const d = Math.round(Number(extendDays))
    if (!Number.isFinite(d) || d < 1 || d > 3650) {
      setError('Enter a number of days between 1 and 3650.')
      return Promise.resolve()
    }
    return runBulk('Extend', async (ids) => {
      const set = new Set(ids)
      const rows = listings.filter((l) => set.has(l.id))
      const { updated, dates } = await extendListings(rows, d, (done) => setBulkBusy(`Extending… ${done}/${ids.length}`))
      const draft: Record<string, string> = {}
      for (const [date, dIds] of Object.entries(dates)) {
        patchLocal(dIds, { activeUntil: date })
        for (const id of dIds) draft[id] = date
      }
      setEndDateDrafts((prev) => ({ ...prev, ...draft }))
      return `Extended ${updated} listing(s) by ${d} days (from their current end date, or from today if none/expired).`
    })
  }

  const bulkRestore = () =>
    runBulk('Restore', async (ids) => {
      const n = await restoreListings(ids, (d) => setBulkBusy(`Restoring… ${d}/${ids.length}`))
      patchLocal(ids, { deletedAt: null })
      return `Restored ${n} listing(s) from Trash.`
    })

  const bulkPermanent = () =>
    runBulk('Delete forever', async (ids) => {
      const n = await deleteListingsPermanently(ids, (d) => setBulkBusy(`Deleting… ${d}/${ids.length}`))
      const set = new Set(ids)
      setListings((prev) => prev.filter((row) => !set.has(row.id)))
      setConfirmPermanent(false)
      return `Permanently deleted ${n} listing(s) from Trash.`
    })

  async function handleEmptyTrash() {
    setBulkBusy('Emptying Trash…')
    setStatus('')
    setError('')
    try {
      const n = await emptyTrash()
      setListings((prev) => prev.filter((row) => !row.deletedAt))
      setSelected(new Set())
      setConfirmEmptyTrash(false)
      setStatus(`Emptied Trash — permanently deleted ${n} listing(s).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Empty Trash failed')
    } finally {
      setBulkBusy('')
    }
  }

  async function handleRestoreOne(l: Listing) {
    setBusyId(l.id)
    setStatus('')
    setError('')
    try {
      await restoreListings([l.id])
      patchLocal([l.id], { deletedAt: null })
      setStatus(`Restored ${l.address} from Trash.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleLive(l: Listing) {
    setBusyId(l.id)
    setStatus('')
    setError('')
    try {
      const nextLive = !l.live
      // Admin MLS / inserts always stay paid=true when activating
      const updated = await updateListing(l.id, {
        live: nextLive,
        paid: nextLive ? true : l.paid,
      })
      setListings((prev) => prev.map((row) => (row.id === l.id ? updated : row)))
      setStatus(`${updated.address} is now ${updated.live ? 'active (live)' : 'inactive'}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSaveEndDate(l: Listing) {
    setBusyId(l.id)
    setStatus('')
    setError('')
    try {
      const raw = (endDateDrafts[l.id] ?? '').trim()
      const activeUntil = raw || null
      const updated = await updateListing(l.id, { activeUntil })
      setListings((prev) => prev.map((row) => (row.id === l.id ? updated : row)))
      setStatus(
        activeUntil
          ? `End date set to ${activeUntil} for ${updated.address}.`
          : `End date cleared for ${updated.address}.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save end date')
    } finally {
      setBusyId(null)
    }
  }

  async function handleAddListing(e: FormEvent) {
    e.preventDefault()
    setSavingAdd(true)
    setError('')
    setStatus('')
    try {
      const price = Number(addForm.price)
      if (!addForm.address.trim() || !price) {
        throw new Error('Address and price are required.')
      }
      const draft: Listing = {
        id: uid(),
        type: addForm.type,
        address: addForm.address.trim(),
        city: addForm.city.trim() || 'Fairfield',
        state: (addForm.state.trim() || 'CT').toUpperCase().slice(0, 2),
        zip: addForm.zip.trim(),
        beds: Number(addForm.beds) || 0,
        baths: Number(addForm.baths) || 0,
        price,
        pets: addForm.pets,
        description: addForm.description.trim(),
        photoDataUrls: [],
        ownerName: MLS_OWNER.name,
        ownerPhone: MLS_OWNER.phone,
        ownerEmail: MLS_OWNER.email,
        createdAt: new Date().toISOString(),
        paid: true,
        live: addForm.live,
        is_mls: true,
        activeUntil: addForm.activeUntil.trim() || null,
      }
      const created = await insertListing(draft)
      setListings((prev) => [created, ...prev])
      setEndDateDrafts((prev) => ({
        ...prev,
        [created.id]: created.activeUntil?.slice(0, 10) ?? '',
      }))
      setAddForm(emptyAddForm())
      setStatus(`Added MLS listing: ${created.address} (${created.live ? 'active' : 'inactive'}).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add listing')
    } finally {
      setSavingAdd(false)
    }
  }


  async function handleMlsLinkImport() {
    const url = mlsLinkUrl.trim()
    if (!url) {
      setError('Paste a SMART MLS shared-link URL first.')
      return
    }
    setPdfBusy(true)
    setError('')
    setStatus('')
    setPublishProgress('')
    setPdfDrafts([])
    try {
      const { drafts, skippedNoMls, skippedStatus, totalRows } = await importMlsSharedLink(url)
      setPdfDrafts(drafts)
      setPdfName('shared link')
      const skipBits = [
        skippedNoMls ? `${skippedNoMls} no MLS#` : '',
        skippedStatus ? `${skippedStatus} closed/sold/etc` : '',
      ]
        .filter(Boolean)
        .join(', ')
      const withPhotos = drafts.filter((d) => (d.photoDataUrls?.length ?? 0) > 0).length
      setStatus(
        `Imported ${drafts.length} MLS listing(s) from shared link (${totalRows} row(s)${skipBits ? `; skipped ${skipBits}` : ''}; ${withPhotos} with photos). Edit, then Publish (upsert by MLS#).`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('MLS shared-link import failed:', err)
      setError(`Shared-link import failed: ${msg}`)
      setPdfName('')
      setPdfDrafts([])
    } finally {
      setPdfBusy(false)
    }
  }

  async function handlePdfFile(file: File | null) {
    if (!file) return
    setPdfBusy(true)
    setError('')
    setStatus('')
    setPdfDrafts([])
    setPdfName(file.name)
    try {
      const { drafts } = await uploadMlsPdf(file)
      setPdfDrafts(drafts)
      setStatus(
        `Parsed ${drafts.length} candidate(s) from ${file.name} (server). Edit, then Publish all.`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('MLS PDF parse failed:', err)
      setError(
        `PDF upload failed: ${msg}. Prefer Paste MLS text below if the PDF is a scan / image-only.`,
      )
      setPdfName('')
      setPdfDrafts([])
    } finally {
      setPdfBusy(false)
    }
  }

  async function handleExcelFile(file: File | null) {
    if (!file) return
    setPdfBusy(true)
    setError('')
    setStatus('')
    setPublishProgress('')
    setPdfDrafts([])
    setPdfName(file.name)
    try {
      const { drafts, skippedNoMls, skippedStatus, totalRows } = await parseMlsSpreadsheet(file)
      setPdfDrafts(drafts)
      const skipBits = [
        skippedNoMls ? `${skippedNoMls} no MLS#` : '',
        skippedStatus ? `${skippedStatus} closed/sold/etc` : '',
      ]
        .filter(Boolean)
        .join(', ')
      setStatus(
        `Parsed ${drafts.length} MLS row(s) from ${file.name} (${totalRows} data row(s)${skipBits ? `; skipped ${skipBits}` : ''}). Edit, then Publish.`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('MLS Excel/CSV parse failed:', err)
      setError(`Excel/CSV parse failed: ${msg}`)
      setPdfName('')
      setPdfDrafts([])
    } finally {
      setPdfBusy(false)
    }
  }

  function handlePasteParse() {
    setError('')
    setStatus('')
    setPdfBusy(true)
    try {
      const { drafts } = parseMlsPasteText(pasteText)
      setPdfDrafts(drafts)
      setPdfName('pasted text')
      setStatus(`Parsed ${drafts.length} candidate(s) from pasted text. Edit, then Publish all.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Paste parse failed: ${msg}`)
      setPdfDrafts([])
      setPdfName('')
    } finally {
      setPdfBusy(false)
    }
  }

  function updateDraft(key: string, patch: Partial<MlsDraft>) {
    setPdfDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  function removeDraft(key: string) {
    setPdfDrafts((prev) => prev.filter((d) => d.key !== key))
  }

  async function handlePublishPdf() {
    const selected = pdfDrafts.filter((d) => d.include)
    if (!selected.length) {
      setError('No candidates selected to publish.')
      return
    }
    for (const d of selected) {
      if (!d.address.trim() || !d.price) {
        setError('Every selected row needs an address and price. Fix the preview table first.')
        return
      }
    }
    const useUpsert = selected.some((d) => !!d.id)
    if (
      !confirm(
        `Publish ${selected.length} MLS listing(s) as live + paid for ${MLS_OWNER.name}?${useUpsert ? ' (upsert by MLS id — re-imports update existing rows)' : ''}`,
      )
    ) {
      return
    }
    setPublishing(true)
    setError('')
    setStatus('')
    setPublishProgress(useUpsert ? `0 / ${selected.length}` : '')
    try {
      const now = new Date().toISOString()
      const payloads: Listing[] = selected.map((d) => ({
        id: d.id || uid(),
        type: d.type,
        address: d.address.trim(),
        city: d.city.trim() || 'Fairfield',
        state: (d.state.trim() || 'CT').toUpperCase().slice(0, 2),
        zip: d.zip.trim(),
        beds: Number(d.beds) || 0,
        baths: Number(d.baths) || 0,
        price: Number(d.price) || 0,
        pets: d.pets,
        description: d.description.trim(),
        photoDataUrls: Array.isArray(d.photoDataUrls) ? d.photoDataUrls : [],
        ownerName: MLS_OWNER.name,
        ownerPhone: MLS_OWNER.phone,
        ownerEmail: MLS_OWNER.email,
        createdAt: now,
        paid: true,
        live: true,
        is_mls: true,
        activeUntil: null,
        sqft: d.sqft ?? null,
        yearBuilt: d.yearBuilt ?? null,
        mlsStatus: d.mlsStatus ?? null,
      }))
      const { ok, failed } = useUpsert
        ? await upsertListings(payloads, {
            batchSize: 100,
            onProgress: (done, total) => setPublishProgress(`${done} / ${total}`),
          })
        : await insertListings(payloads)
      if (ok.length) {
        const byId = new Map(ok.map((r) => [r.id, r]))
        setListings((prev) => {
          const rest = prev.filter((l) => !byId.has(l.id))
          return [...ok, ...rest]
        })
        setEndDateDrafts((prev) => {
          const next = { ...prev }
          for (const row of ok) next[row.id] = row.activeUntil?.slice(0, 10) ?? ''
          return next
        })
      }
      if (failed.length) {
        setError(`${failed.length} failed to publish. First error: ${failed[0].error}`)
      }
      setStatus(
        `Published ${ok.length} MLS listing(s)${failed.length ? `, ${failed.length} failed` : ''}.`,
      )
      if (!failed.length) {
        setPdfDrafts([])
        setPdfName('')
        setPasteText('')
        setMlsLinkUrl('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk publish failed')
    } finally {
      setPublishing(false)
      setPublishProgress('')
    }
  }

  async function handleAddLink(e: FormEvent) {
    e.preventDefault()
    setSavingLink(true)
    setError('')
    setStatus('')
    try {
      const created = await insertPartnerLink({
        title: form.title,
        url: form.url,
        category: form.category,
        blurb: form.blurb,
        sortOrder: Number(form.sortOrder) || 0,
        enabled: form.enabled,
      })
      setLinks((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder))
      setForm(emptyForm())
      setPartnerSetupError('')
      setStatus(`Added partner link: ${created.title}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add link')
    } finally {
      setSavingLink(false)
    }
  }

  async function toggleLink(link: PartnerLink) {
    setBusyId(link.id)
    setError('')
    try {
      const updated = await updatePartnerLink(link.id, { enabled: !link.enabled })
      setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)))
      setStatus(`${updated.title} is now ${updated.enabled ? 'visible' : 'hidden'} on the site.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  async function removeLink(link: PartnerLink) {
    if (!confirm(`Delete partner link “${link.title}”?`)) return
    setBusyId(link.id)
    setError('')
    try {
      await deletePartnerLink(link.id)
      setLinks((prev) => prev.filter((l) => l.id !== link.id))
      setStatus(`Removed ${link.title}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setBusyId(null)
    }
  }

  if (!adminPassword) {
    return (
      <div className="card">
        <div className="body">
          <h1 style={{ margin: '0 0 .5rem' }}>Admin</h1>
          <p className="meta" style={{ margin: 0 }}>
            Set <code>VITE_ADMIN_PASSWORD</code> in the environment, then rebuild/redeploy.
          </p>
        </div>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div className="card" style={{ maxWidth: 420 }}>
        <div className="body">
          <h1 style={{ margin: '0 0 .35rem' }}>Admin</h1>
          <p className="meta">Password unlocks this tab for the session.</p>
          <form className="form" style={{ boxShadow: 'none', border: 'none', padding: 0 }} onSubmit={handleUnlock}>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {gateError ? <div style={{ color: '#b91c1c', fontSize: '0.92rem' }}>{gateError}</div> : null}
            <button type="submit" className="btn">
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ margin: '0 0 .35rem' }}>Admin</h1>
          <p className="meta" style={{ margin: 0 }}>
            MLS backdoor for {MLS_OWNER.name}: add/remove, active toggle, end date, shared-link / Excel / PDF
            bulk publish. Owner defaults to {MLS_OWNER.name} · {MLS_OWNER.phone}.
          </p>
        </div>
        <button type="button" className="btn secondary" onClick={handleLock}>
          Lock
        </button>
      </div>

      {status ? <div className="success">{status}</div> : null}
      {error ? (
        <div className="card">
          <div className="body" style={{ color: '#b91c1c' }}>
            {error}
          </div>
        </div>
      ) : null}

      <div className="admin-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'listings'}
          className={`admin-tab${tab === 'listings' ? ' active' : ''}`}
          onClick={() => setSearchParams({})}
        >
          Listings &amp; MLS
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'leads'}
          className={`admin-tab${tab === 'leads' ? ' active' : ''}`}
          onClick={() => setSearchParams({ tab: 'leads' })}
        >
          CMA Leads
        </button>
      </div>

      {tab === 'leads' ? <CmaLeadsPanel /> : null}
      {tab === 'listings' ? (
      <>
      {/* Excel / PDF / paste → preview → publish */}
      <section className="card">
        <div className="body" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>MLS → Search (uploadable)</h2>
            <p className="meta" style={{ margin: 0 }}>
              Paste a SMART MLS shared link, upload an Excel/CSV export, an MLS PDF (server), or paste
              MLS text. Candidates appear in an editable table, then publish as is_mls + paid + live
              for {MLS_OWNER.name}. Shared-link and Excel rows upsert by MLS number (id = mls_######).
            </p>
            <p className="meta" style={{ margin: '0.5rem 0 0', color: '#856404' }}>
              Tip: use Remove all MLS first if you want to replace the old batch.
            </p>
          </div>
          <label>
            Paste MLS link (SMART MLS shared link)
            <input
              type="url"
              placeholder="https://smartmls-portal.connectmls.com/shared-link/…/uuid"
              value={mlsLinkUrl}
              disabled={pdfBusy || publishing}
              onChange={(e) => setMlsLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleMlsLinkImport()
                }
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              disabled={pdfBusy || publishing || !mlsLinkUrl.trim()}
              onClick={() => void handleMlsLinkImport()}
            >
              {pdfBusy ? 'Importing…' : 'Import MLS link'}
            </button>
          </div>
          <label>
            Excel / CSV (SMART MLS export)
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              disabled={pdfBusy || publishing}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                void handleExcelFile(f)
                e.target.value = ''
              }}
            />
          </label>
          <label>
            PDF file (server extract)
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={pdfBusy || publishing}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                void handlePdfFile(f)
                e.target.value = ''
              }}
            />
          </label>
          <label>
            Paste MLS text (fallback)
            <textarea
              rows={6}
              placeholder="Paste addresses / prices / beds from the MLS PDF or print dialog…"
              value={pasteText}
              disabled={pdfBusy || publishing}
              onChange={(e) => setPasteText(e.target.value)}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary"
              disabled={pdfBusy || publishing || !pasteText.trim()}
              onClick={() => handlePasteParse()}
            >
              Parse pasted text
            </button>
          </div>
          {pdfBusy ? <p className="meta">Reading / parsing…</p> : null}
          {pdfName && !pdfBusy ? <p className="meta">Source: {pdfName}</p> : null}

          {pdfDrafts.length > 0 ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Use</th>
                      <th>Photo</th>
                      <th>Type</th>
                      <th>Address</th>
                      <th>City</th>
                      <th>ST</th>
                      <th>ZIP</th>
                      <th>Price</th>
                      <th>Beds</th>
                      <th>Baths</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pdfDrafts.map((d) => (
                      <tr key={d.key} style={{ opacity: d.include ? 1 : 0.45 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={d.include}
                            onChange={(e) => updateDraft(d.key, { include: e.target.checked })}
                          />
                        </td>
                        <td>
                          {d.photoDataUrls?.[0] ? (
                            <img
                              src={d.photoDataUrls[0]}
                              alt=""
                              width={48}
                              height={36}
                              style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="meta">—</span>
                          )}
                        </td>
                        <td>
                          <select
                            value={d.type}
                            onChange={(e) => updateDraft(d.key, { type: e.target.value as ListingType })}
                          >
                            <option value="sale">sale</option>
                            <option value="rent">rent</option>
                          </select>
                        </td>
                        <td>
                          <input
                            value={d.address}
                            onChange={(e) => updateDraft(d.key, { address: e.target.value })}
                            style={{ minWidth: 140 }}
                          />
                        </td>
                        <td>
                          <input
                            value={d.city}
                            onChange={(e) => updateDraft(d.key, { city: e.target.value })}
                            style={{ width: 100 }}
                          />
                        </td>
                        <td>
                          <input
                            value={d.state}
                            maxLength={2}
                            onChange={(e) =>
                              updateDraft(d.key, {
                                state: e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase(),
                              })
                            }
                            style={{ width: 44 }}
                          />
                        </td>
                        <td>
                          <input
                            value={d.zip}
                            onChange={(e) => updateDraft(d.key, { zip: e.target.value })}
                            style={{ width: 80 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={d.price || ''}
                            onChange={(e) => updateDraft(d.key, { price: Number(e.target.value) || 0 })}
                            style={{ width: 100 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={d.beds}
                            onChange={(e) => updateDraft(d.key, { beds: Number(e.target.value) || 0 })}
                            style={{ width: 56 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step={0.5}
                            value={d.baths}
                            onChange={(e) => updateDraft(d.key, { baths: Number(e.target.value) || 0 })}
                            style={{ width: 56 }}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() => removeDraft(d.key)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  disabled={publishing}
                  onClick={() => void handlePublishPdf()}
                >
                  {publishing
                    ? publishProgress
                      ? `Publishing… ${publishProgress}`
                      : 'Publishing…'
                    : `Publish ${pdfDrafts.filter((d) => d.include).length} as MLS live`}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={publishing}
                  onClick={() => {
                    setPdfDrafts([])
                    setPdfName('')
                    setPasteText('')
                    setMlsLinkUrl('')
                  }}
                >
                  Delete all (clear preview)
                </button>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {/* Add one listing */}
      <section className="card">
        <div className="body" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>Add one listing</h2>
            <p className="meta" style={{ margin: 0 }}>
              Inserts as is_mls=true, paid=true. Contact: {MLS_OWNER.name} · {MLS_OWNER.phone}.
            </p>
          </div>
          <form
            className="form"
            style={{ boxShadow: 'none', border: '1px solid var(--line)' }}
            onSubmit={handleAddListing}
          >
            <div className="row">
              <label>
                Type
                <select
                  value={addForm.type}
                  onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value as ListingType }))}
                >
                  <option value="sale">For sale</option>
                  <option value="rent">For rent</option>
                </select>
              </label>
              <label>
                Price ($)
                <input
                  required
                  type="number"
                  min={1}
                  value={addForm.price}
                  onChange={(e) => setAddForm((f) => ({ ...f, price: e.target.value }))}
                />
              </label>
              <label>
                End date (optional)
                <input
                  type="date"
                  value={addForm.activeUntil}
                  onChange={(e) => setAddForm((f) => ({ ...f, activeUntil: e.target.value }))}
                />
              </label>
            </div>
            <label>
              Street address
              <input
                required
                value={addForm.address}
                onChange={(e) => setAddForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="21 Ardmore St"
              />
            </label>
            <div className="row">
              <label>
                City
                <input
                  value={addForm.city}
                  onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))}
                />
              </label>
              <label>
                State
                <input
                  maxLength={2}
                  value={addForm.state}
                  onChange={(e) =>
                    setAddForm((f) => ({
                      ...f,
                      state: e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase(),
                    }))
                  }
                />
              </label>
              <label>
                ZIP
                <input
                  value={addForm.zip}
                  onChange={(e) => setAddForm((f) => ({ ...f, zip: e.target.value }))}
                />
              </label>
            </div>
            <div className="row">
              <label>
                Beds
                <input
                  type="number"
                  min={0}
                  value={addForm.beds}
                  onChange={(e) => setAddForm((f) => ({ ...f, beds: e.target.value }))}
                />
              </label>
              <label>
                Baths
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={addForm.baths}
                  onChange={(e) => setAddForm((f) => ({ ...f, baths: e.target.value }))}
                />
              </label>
              <label>
                Pets
                <select
                  value={addForm.pets}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, pets: e.target.value as Listing['pets'] }))
                  }
                >
                  <option value="no">No pets</option>
                  <option value="yes">Pets OK</option>
                  <option value="negotiable">Negotiable</option>
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea
                rows={3}
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={addForm.live}
                onChange={(e) => setAddForm((f) => ({ ...f, live: e.target.checked }))}
              />
              Active (live) immediately
            </label>
            <button type="submit" className="btn" disabled={savingAdd}>
              {savingAdd ? 'Saving…' : 'Add MLS listing'}
            </button>
          </form>
        </div>
      </section>

      {/* Remove all MLS */}
      <section className="card" style={{ borderColor: '#721c24' }}>
        <div className="body" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem', color: '#721c24' }}>Remove all MLS</h2>
            <p className="meta" style={{ margin: 0 }}>
              Deletes every listing with is_mls=true in one shot. DIY / owner-posted listings are kept.
              Currently{' '}
              <strong>{listings.filter((l) => l.is_mls).length}</strong> MLS listing(s) loaded.
            </p>
          </div>
          <button
            type="button"
            className="btn danger"
            style={{ padding: '0.7rem 1.15rem', fontSize: '0.95rem' }}
            disabled={removingMls || loading || listings.filter((l) => l.is_mls).length === 0}
            onClick={() => void handleRemoveAllMls()}
          >
            {removingMls ? 'Removing…' : 'Remove all MLS'}
          </button>
        </div>
      </section>

      {/* Delete all DIY */}
      <section className="card" style={{ borderColor: '#721c24' }}>
        <div className="body" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem', color: '#721c24' }}>Delete all DIY listings</h2>
            <p className="meta" style={{ margin: 0 }}>
              Deletes every owner-posted (non-MLS) listing. MLS listings are kept. Currently{' '}
              <strong>{listings.filter((l) => !l.is_mls).length}</strong> DIY listing(s) loaded.
            </p>
          </div>
          <button
            type="button"
            className="btn danger"
            style={{ padding: '0.7rem 1.15rem', fontSize: '0.95rem' }}
            disabled={removingDiy || loading || listings.filter((l) => !l.is_mls).length === 0}
            onClick={() => setConfirmDiy(true)}
          >
            Delete all DIY
          </button>
        </div>
      </section>

      <MlsSyncPanel onImported={reloadListings} />

      <MlsExpiryPanel
        listings={listings}
        onChanged={reloadListings}
        onStatus={(m) => {
          setError('')
          setStatus(m)
        }}
        onError={(m) => {
          setStatus('')
          setError(m)
        }}
      />

      {/* All listings with toggle / end date / delete */}
      <section>
        <h2 style={{ margin: '0 0 .75rem' }}>All listings</h2>
        {!loading && listings.length > 0 ? (
          <div className="admin-search" role="search">
            <div className="admin-search-row">
              <div className="admin-search-box">
                <input
                  type="search"
                  className="admin-search-input"
                  aria-label="Search listings"
                  placeholder="Search address, city, ZIP, MLS #, owner name / phone / email, rent or sale…"
                  value={listingQuery}
                  onChange={(e) => {
                    setListingQuery(e.target.value)
                    setListingLimit(PAGE_SIZE)
                    setSelected(new Set())
                  }}
                  autoComplete="off"
                />
                {listingQuery ? (
                  <button
                    type="button"
                    className="admin-search-clear"
                    aria-label="Clear search"
                    onClick={() => {
                      setListingQuery('')
                      setListingLimit(PAGE_SIZE)
                      setSelected(new Set())
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div className="admin-search-count" aria-live="polite">
                {filteredListings.length} of {poolSize}
              </div>
            </div>
            <div className="admin-chips" role="group" aria-label="Filter listings">
              {LISTING_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`admin-chip${listingFilter === f.key ? ' active' : ''}`}
                  aria-pressed={listingFilter === f.key}
                  onClick={() => {
                    setListingFilter(f.key)
                    setListingLimit(PAGE_SIZE)
                    setSelected(new Set())
                  }}
                >
                  {f.label} <span className="admin-chip-n">{filterCounts[f.key]}</span>
                </button>
              ))}
              {listingFiltersActive ? (
                <button
                  type="button"
                  className="admin-chip reset"
                  onClick={() => {
                    setListingQuery('')
                    setListingFilter('all')
                    setListingLimit(PAGE_SIZE)
                    setSelected(new Set())
                  }}
                >
                  Reset
                </button>
              ) : null}
            </div>
            {inTrash ? (
              <div className="bulk-trash-note">
                <span>
                  <strong>Trash</strong> — deleted listings are kept {TRASH_DAYS} days so you can undo, then removed for good
                  (automatically, every day).
                </span>
                <button
                  type="button"
                  className="btn danger"
                  disabled={filterCounts.trash === 0 || !!bulkBusy}
                  onClick={() => setConfirmEmptyTrash(true)}
                >
                  Empty trash ({filterCounts.trash})
                </button>
              </div>
            ) : null}
            {filteredListings.length > 0 ? (
              <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
                <label className="bulk-check">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} />
                  <span>Select shown ({visibleListings.length})</span>
                </label>
                <button
                  type="button"
                  className="btn ghost bulk-sm"
                  onClick={selectAllMatching}
                  disabled={selected.size === filteredListings.length}
                >
                  Select all {filteredListings.length} matching
                </button>
                {selected.size > 0 ? (
                  <>
                    <span className="bulk-count">
                      <strong>{selected.size}</strong> selected
                    </span>
                    <button type="button" className="btn ghost bulk-sm" onClick={() => setSelected(new Set())}>
                      Clear selection
                    </button>
                    {inTrash ? (
                      <>
                        <button type="button" className="btn secondary bulk-sm" disabled={!!bulkBusy} onClick={() => void bulkRestore()}>
                          Restore selected
                        </button>
                        <button type="button" className="btn danger bulk-sm" disabled={!!bulkBusy} onClick={() => setConfirmPermanent(true)}>
                          Delete selected forever
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn danger bulk-sm"
                          disabled={!!bulkBusy}
                          onClick={() => {
                            if (selected.size > 20) setConfirmBulkTrash(true)
                            else if (confirm(`Move ${selected.size} listing(s) to Trash? You can restore them for ${TRASH_DAYS} days.`)) void bulkTrash()
                          }}
                        >
                          Delete selected
                        </button>
                        <button type="button" className="btn secondary bulk-sm" disabled={!!bulkBusy} onClick={() => void bulkLive(false)}>
                          Deactivate selected
                        </button>
                        <button type="button" className="btn secondary bulk-sm" disabled={!!bulkBusy} onClick={() => void bulkLive(true)}>
                          Activate selected
                        </button>
                        <span className="bulk-extend">
                          <button type="button" className="btn secondary bulk-sm" disabled={!!bulkBusy} onClick={() => void bulkExtend()}>
                            Extend selected by
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={3650}
                            value={extendDays}
                            onChange={(e) => setExtendDays(e.target.value)}
                            className="bulk-num"
                            aria-label="Days to extend by"
                          />
                          <span>days</span>
                        </span>
                      </>
                    )}
                  </>
                ) : null}
                {bulkBusy ? <span className="bulk-busy">{bulkBusy}</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {loading ? (
          <div className="card">
            <div className="body">Loading listings…</div>
          </div>
        ) : listings.length === 0 ? (
          <div className="card">
            <div className="body">No listings in the database.</div>
          </div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '2.2rem' }}>
                    <input type="checkbox" aria-label="Select shown listings" checked={allVisibleSelected} onChange={toggleVisible} />
                  </th>
                  <th>Address</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>MLS</th>
                  <th>End date</th>
                  <th>Owner</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredListings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="meta" style={{ padding: '1.25rem' }}>
                      No listings match{listingQuery.trim() ? ` “${listingQuery.trim()}”` : ''}
                      {listingFilter !== 'all' ? ` in ${LISTING_FILTERS.find((f) => f.key === listingFilter)?.label}` : ''}.
                    </td>
                  </tr>
                ) : null}
                {visibleListings.map((l) => (
                  <tr key={l.id} className={selected.has(l.id) ? 'row-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${l.address}`}
                        checked={selected.has(l.id)}
                        onChange={() => toggleSelected(l.id)}
                      />
                    </td>
                    <td>
                      <strong>{l.address}</strong>
                      <div className="meta">
                        {l.city}, {l.state} {l.zip}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${l.type}`}>{l.type}</span>
                    </td>
                    <td>{formatPrice(l)}</td>
                    <td>
                      {l.deletedAt ? (
                        <>
                          <span className="badge">in trash</span>
                          <div className="meta">purged in {trashDaysLeft(l.deletedAt)}d</div>
                        </>
                      ) : (
                        <>
                          <span className="badge">{statusLabel(l)}</span>
                          <div className="meta">
                            {l.live ? 'live' : 'off'} / {l.paid ? 'paid' : 'unpaid'}
                          </div>
                        </>
                      )}
                    </td>
                    <td>{l.is_mls ? 'yes' : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="date"
                          value={endDateDrafts[l.id] ?? ''}
                          onChange={(e) =>
                            setEndDateDrafts((prev) => ({ ...prev, [l.id]: e.target.value }))
                          }
                          style={{ fontSize: '0.85rem' }}
                        />
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem' }}
                          disabled={busyId === l.id}
                          onClick={() => void handleSaveEndDate(l)}
                        >
                          Save
                        </button>
                        {(endDateDrafts[l.id] || l.activeUntil) && (
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem' }}
                            disabled={busyId === l.id}
                            onClick={() => {
                              setEndDateDrafts((prev) => ({ ...prev, [l.id]: '' }))
                              void (async () => {
                                setBusyId(l.id)
                                try {
                                  const updated = await updateListing(l.id, { activeUntil: null })
                                  setListings((prev) =>
                                    prev.map((row) => (row.id === l.id ? updated : row)),
                                  )
                                  setStatus(`Cleared end date for ${updated.address}.`)
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Clear failed')
                                } finally {
                                  setBusyId(null)
                                }
                              })()
                            }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>
                      {l.ownerName}
                      <div className="meta">{l.ownerPhone}</div>
                    </td>
                    <td className="meta">{formatDate(l.createdAt)}</td>
                    <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                        disabled={busyId === l.id}
                        onClick={() => setEditListing(l)}
                      >
                        Edit
                      </button>
                      {l.deletedAt ? (
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                          disabled={busyId === l.id}
                          onClick={() => void handleRestoreOne(l)}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                          disabled={busyId === l.id}
                          onClick={() => void handleToggleLive(l)}
                        >
                          {l.live ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn danger"
                        disabled={busyId === l.id}
                        onClick={() => void handleDelete(l.id)}
                      >
                        {busyId === l.id ? '…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredListings.length > visibleListings.length ? (
              <div className="admin-showmore">
                <span className="meta">
                  Showing {visibleListings.length} of {filteredListings.length}
                </span>
                <button type="button" className="btn secondary" onClick={() => setListingLimit((n) => n + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, filteredListings.length - visibleListings.length)} more
                </button>
                <button type="button" className="btn ghost" onClick={() => setListingLimit(filteredListings.length)}>
                  Show all
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Partner links (unchanged capability) */}
      <section className="card">
        <div className="body" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 .35rem' }}>Partner links</h2>
            <p className="meta" style={{ margin: 0 }}>
              Same login as listings. Enabled links show under “Helpful connections” on the homepage.
            </p>
          </div>

          {partnerSetupError ? (
            <div style={{ background: '#fff8e8', border: '1px solid #ffeeba', padding: '0.9rem 1rem', color: '#856404' }}>
              <strong>Setup needed:</strong> {partnerSetupError}
              <div className="meta" style={{ marginTop: '0.5rem' }}>
                Supabase → listingneeded project → SQL Editor → run the create table script, then refresh this page.
              </div>
            </div>
          ) : null}

          <form
            className="form"
            style={{ boxShadow: 'none', border: '1px solid var(--line)', opacity: partnerSetupError ? 0.55 : 1 }}
            onSubmit={handleAddLink}
          >
            <div className="row">
              <label>
                Title
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Preferred mortgage broker"
                />
              </label>
              <label>
                Category
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as PartnerCategory }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {PARTNER_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              URL
              <input
                required
                type="url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="www.rocketmortgage.com or https://..."
              />
            </label>
            <label>
              Short blurb (optional)
              <input
                value={form.blurb}
                onChange={(e) => setForm((f) => ({ ...f, blurb: e.target.value }))}
                placeholder="Pre-approval help for buyers"
              />
            </label>
            <div className="row">
              <label>
                Sort order
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </label>
              <label style={{ alignContent: 'end' }}>
                <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                  />
                  Show on site
                </span>
              </label>
            </div>
            <button type="submit" className="btn" disabled={savingLink || !!partnerSetupError}>
              {savingLink ? 'Saving…' : 'Add partner link'}
            </button>
          </form>

          {links.length === 0 ? (
            <p className="meta">No partner links yet.</p>
          ) : (
            <>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn danger" onClick={() => setConfirmLinks(true)} disabled={removingLinks}>
                Delete all partner links
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>URL</th>
                    <th>Order</th>
                    <th>Visible</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link.id}>
                      <td>
                        <strong>{link.title}</strong>
                        {link.blurb ? <div className="meta">{link.blurb}</div> : null}
                      </td>
                      <td>
                        <span className="badge">{PARTNER_CATEGORY_LABELS[link.category]}</span>
                      </td>
                      <td style={{ wordBreak: 'break-all', maxWidth: 220 }}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.url}
                        </a>
                      </td>
                      <td>{link.sortOrder}</td>
                      <td>{link.enabled ? 'yes' : 'no'}</td>
                      <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                          disabled={busyId === link.id}
                          onClick={() => setEditLink(link)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                          disabled={busyId === link.id}
                          onClick={() => void toggleLink(link)}
                        >
                          {link.enabled ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          disabled={busyId === link.id}
                          onClick={() => void removeLink(link)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </section>
      </>
      ) : null}

      {confirmBulkTrash ? (
        <ConfirmDeleteAll
          title={`Move ${selected.size} to Trash`}
          message={
            <>
              This moves <strong>{selected.size}</strong> selected listing(s) to the Trash. You can restore them for {TRASH_DAYS} days;
              after that they are removed for good.
            </>
          }
          busy={!!bulkBusy}
          onConfirm={bulkTrash}
          onCancel={() => setConfirmBulkTrash(false)}
        />
      ) : null}
      {confirmPermanent ? (
        <ConfirmDeleteAll
          title={`Delete ${selected.size} forever`}
          message={
            <>
              This permanently deletes <strong>{selected.size}</strong> listing(s) from the Trash. This cannot be undone.
            </>
          }
          busy={!!bulkBusy}
          onConfirm={bulkPermanent}
          onCancel={() => setConfirmPermanent(false)}
        />
      ) : null}
      {confirmEmptyTrash ? (
        <ConfirmDeleteAll
          title="Empty trash"
          message={
            <>
              This permanently deletes all <strong>{filterCounts.trash}</strong> listing(s) in the Trash. This cannot be undone.
            </>
          }
          busy={!!bulkBusy}
          onConfirm={handleEmptyTrash}
          onCancel={() => setConfirmEmptyTrash(false)}
        />
      ) : null}
      {editListing ? (
        <ListingEditModal
          listing={editListing}
          onClose={() => setEditListing(null)}
          onSaved={(u) => {
            setListings((prev) => prev.map((row) => (row.id === u.id ? u : row)))
            setEndDateDrafts((prev) => ({ ...prev, [u.id]: u.activeUntil?.slice(0, 10) ?? '' }))
            setStatus(`Saved ${u.address}.`)
            setEditListing(null)
          }}
        />
      ) : null}
      {editLink ? (
        <PartnerEditModal
          link={editLink}
          onClose={() => setEditLink(null)}
          onSaved={(u) => {
            setLinks((prev) => prev.map((row) => (row.id === u.id ? u : row)))
            setStatus(`Saved ${u.title}.`)
            setEditLink(null)
          }}
        />
      ) : null}
      {confirmDiy ? (
        <ConfirmDeleteAll
          title="Delete all DIY listings"
          message={<>This deletes all <strong>{listings.filter((l) => !l.is_mls).length}</strong> owner-posted (non-MLS) listing(s). MLS listings stay.</>}
          busy={removingDiy}
          onConfirm={handleRemoveAllDiy}
          onCancel={() => setConfirmDiy(false)}
        />
      ) : null}
      {confirmLinks ? (
        <ConfirmDeleteAll
          title="Delete all partner links"
          message={<>This deletes all <strong>{links.length}</strong> partner link(s) from the homepage.</>}
          busy={removingLinks}
          onConfirm={handleRemoveAllLinks}
          onCancel={() => setConfirmLinks(false)}
        />
      ) : null}
    </div>
  )
}
