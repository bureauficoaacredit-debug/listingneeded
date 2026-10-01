import { useEffect, useRef, useState } from 'react'
import type { Listing } from '../lib/types'
import {
  buildShareCard,
  cardFilename,
  downloadBlob,
  listingUrl,
  shareText,
} from '../lib/shareListing'

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 3v12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 11.5v7A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Share button for a listing. On phones / browsers with the Web Share API it opens the native sheet
 * (Messages, Mail, AirDrop, Save Image) with the photo card attached; otherwise a menu offers
 * Copy link, Email, Text and Save as image.
 */
export default function ShareButton({ listing }: { listing: Listing }) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const url = listingUrl(listing)
  const text = shareText(listing)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 3500)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      flash('Link copied')
    } catch {
      window.prompt('Copy this link:', url)
    }
    setOpen(false)
  }

  async function saveImage() {
    setBusy(true)
    try {
      const { blob, photoIncluded } = await buildShareCard(listing)
      downloadBlob(blob, cardFilename(listing))
      flash(photoIncluded ? 'Image saved — find it in Downloads / Photos' : 'Card saved (photo could not be embedded)')
    } catch {
      flash('Could not create the image')
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  async function onShare() {
    // Native share sheet (phones, Safari/Chrome on Mac, Edge) — include the photo card as a file when supported.
    if (typeof navigator.share === 'function') {
      setBusy(true)
      try {
        let files: File[] | undefined
        try {
          const { blob } = await buildShareCard(listing)
          const f = new File([blob], cardFilename(listing), { type: 'image/png' })
          if (navigator.canShare?.({ files: [f] })) files = [f]
        } catch {
          /* share link only */
        }
        await navigator.share({ title: listing.address, text, url, ...(files ? { files } : {}) })
        return
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return // user closed the sheet
        // any other failure falls through to the menu
      } finally {
        setBusy(false)
      }
    }
    setOpen((o) => !o)
  }

  const body = encodeURIComponent(`${text}\n${url}`)
  return (
    <div className="share-wrap" ref={wrap}>
      <button type="button" className="share-btn" onClick={() => void onShare()} aria-haspopup="menu" aria-expanded={open} disabled={busy}>
        <ShareIcon />
        <span>{busy ? 'Preparing…' : 'Share'}</span>
      </button>
      {open ? (
        <div className="share-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => void copyLink()}>Copy link</button>
          <a role="menuitem" href={`mailto:?subject=${encodeURIComponent(listing.address)}&body=${body}`} onClick={() => setOpen(false)}>Email</a>
          <a role="menuitem" href={`sms:?&body=${body}`} onClick={() => setOpen(false)}>Text message</a>
          <button type="button" role="menuitem" onClick={() => void saveImage()}>Save as image (PNG)</button>
        </div>
      ) : null}
      {msg ? <div className="share-toast" role="status">{msg}</div> : null}
    </div>
  )
}
