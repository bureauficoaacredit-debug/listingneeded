import { useEffect, useState } from 'react'
import type { PartnerLink } from '../lib/types'
import { PARTNER_CATEGORY_LABELS } from '../lib/types'
import { enabledPartnerLinks } from '../lib/store'

export default function PartnerResources({ compact = false }: { compact?: boolean }) {
  const [links, setLinks] = useState<PartnerLink[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await enabledPartnerLinks()
        if (!cancelled) setLinks(rows)
      } catch {
        if (!cancelled) setLinks([])
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready || links.length === 0) return null

  return (
    <section className={`partner-band${compact ? ' compact' : ''}`}>
      <h2 className="section-title">Helpful connections</h2>
      <p className="meta partner-intro">
        Mortgage, screening, and other services you can reach in one click. Managed from Admin.
      </p>
      <div className="partner-grid">
        {links.map((link) => (
          <a
            key={link.id}
            className="partner-card"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="badge">{PARTNER_CATEGORY_LABELS[link.category]}</span>
            <strong>{link.title}</strong>
            {link.blurb ? <span className="meta">{link.blurb}</span> : null}
            <span className="partner-cta">Open link →</span>
          </a>
        ))}
      </div>
    </section>
  )
}
