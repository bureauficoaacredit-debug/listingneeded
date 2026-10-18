import { useEffect } from 'react'

const DEFAULT_TITLE = typeof document !== 'undefined' ? document.title : 'Listing Needed'

function setMeta(attr: 'name' | 'property', key: string, value: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  const created = !el
  const prev = el?.content ?? ''
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = value
  return () => {
    if (created) el?.remove()
    else if (el) el.content = prev
  }
}

/** v64: per-page <title> + meta description (and basic Open Graph tags); restored when the page unmounts. */
export function useSeo(title: string | null | undefined, description?: string | null) {
  useEffect(() => {
    if (!title) return
    const prevTitle = document.title
    document.title = title
    const undo = [setMeta('property', 'og:title', title)]
    if (description) {
      const d = description.length > 160 ? description.slice(0, 157).trimEnd() + '…' : description
      undo.push(setMeta('name', 'description', d), setMeta('property', 'og:description', d))
    }
    return () => {
      document.title = prevTitle || DEFAULT_TITLE
      undo.forEach((u) => u())
    }
  }, [title, description])
}
