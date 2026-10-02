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

  const isPhone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  /** Instagram / TikTok have no web share link: copy caption + link, save the photo card, then try the app on phones. */
  async function shareToApp(app: 'Instagram' | 'TikTok') {
    const caption = `${text}\n${url}\nMarcel Najar · www.listingneeded.com · 203-818-3242`
    // copy first, while the tap's user-activation is still fresh (Safari is strict about this)
    let copied = false
    try {
      await navigator.clipboard.writeText(caption)
      copied = true
    } catch {
      /* hint below still tells them where the link is */
    }
    setBusy(true)
    setOpen(false)
    try {
      const { blob } = await buildShareCard(listing)
      downloadBlob(blob, cardFilename(listing))
      flash(copied ? 'Image saved + link copied — paste in your post' : 'Image saved — add the listing link to your post')
      if (isPhone) {
        const scheme = app === 'Instagram' ? 'instagram://camera' : 'snssdk1233://'
        setTimeout(() => {
          window.location.href = scheme
        }, 1200)
      }
    } catch {
      flash(copied ? 'Link copied — could not create the image' : 'Could not create the image')
    } finally {
      setBusy(false)
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
  const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
  const xHref = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  const waHref = `https://wa.me/?text=${body}`
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
          <a role="menuitem" href={fbHref} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>Facebook</a>
          <a role="menuitem" href={xHref} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>X (Twitter)</a>
          <a role="menuitem" href={waHref} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>WhatsApp</a>
          <button type="button" role="menuitem" onClick={() => void shareToApp('Instagram')}>Instagram</button>
          <button type="button" role="menuitem" onClick={() => void shareToApp('TikTok')}>TikTok</button>
          <button type="button" role="menuitem" onClick={() => void saveImage()}>Save as image (PNG)</button>
        </div>
      ) : null}
      {msg ? <div className="share-toast" role="status">{msg}</div> : null}
    </div>
  )
}
