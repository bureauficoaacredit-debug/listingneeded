import { useEffect, useRef, useState } from 'react'

/** v64: same look as the listing Share button (share-btn / share-menu), for any page link such as a blog article. */
export default function ShareLinkButton({ title, text, url }: { title: string; text: string; url: string }) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false)
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
    window.setTimeout(() => setMsg(''), 3000)
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      flash('Link copied')
    } catch {
      window.prompt('Copy this link:', url)
    }
    setOpen(false)
  }
  async function onShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url })
        return
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
      }
    }
    setOpen((o) => !o)
  }
  const body = encodeURIComponent(`${text}\n${url}`)
  return (
    <div className="share-wrap" ref={wrap}>
      <button type="button" className="share-btn" onClick={() => void onShare()} aria-haspopup="menu" aria-expanded={open}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path d="M12 3v12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 11.5v7A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Share</span>
      </button>
      {open ? (
        <div className="share-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => void copy()}>Copy link</button>
          <a role="menuitem" href={`mailto:?subject=${encodeURIComponent(title)}&body=${body}`} onClick={() => setOpen(false)}>Email</a>
          <a role="menuitem" href={`sms:?&body=${body}`} onClick={() => setOpen(false)}>Text message</a>
          <a role="menuitem" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>Facebook</a>
          <a role="menuitem" href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>X (Twitter)</a>
          <a role="menuitem" href={`https://wa.me/?text=${body}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>WhatsApp</a>
          <a role="menuitem" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>LinkedIn</a>
        </div>
      ) : null}
      {msg ? <div className="share-toast" role="status">{msg}</div> : null}
    </div>
  )
}
