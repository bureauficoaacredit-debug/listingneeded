import { useState, useSyncExternalStore } from 'react'
import { canOffer, dismiss, install, isDismissed, snapshot, subscribe } from '../lib/install'

function useOffer() {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  return canOffer()
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="#0a84ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
)
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
)

export function IosSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="a2hs-sheet-wrap" role="dialog" aria-modal="true" aria-label="Add to Home Screen" onClick={onClose}>
      <div className="a2hs-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="a2hs-x" aria-label="Close" onClick={onClose}>×</button>
        <img src="/logo/ln-icon-192.png" alt="" width="56" height="56" />
        <h3>Add Listing Needed to your Home Screen</h3>
        <ol>
          <li><span className="a2hs-step">1</span> Tap the Share button <ShareIcon /></li>
          <li><span className="a2hs-step">2</span> Then tap <b>Add to Home Screen</b> <PlusIcon /></li>
        </ol>
        <button type="button" className="btn primary a2hs-ok" onClick={onClose}>Got it</button>
      </div>
    </div>
  )
}

function useInstallClick() {
  const [sheet, setSheet] = useState(false)
  const click = async () => {
    if ((await install()) === 'ios') setSheet(true)
  }
  return { sheet, setSheet, click }
}

/** Hamburger menu item (phones only). */
export function A2hsMenuItem() {
  const offer = useOffer()
  const { sheet, setSheet, click } = useInstallClick()
  if (!offer && !sheet) return null
  return (
    <>
      <button type="button" className="hmenu-item a2hs-menu" onClick={click}>📲 Add to Home Screen</button>
      {sheet ? <IosSheet onClose={() => setSheet(false)} /> : null}
    </>
  )
}

/** Small dismissible bar (homepage, above the footer). */
export function A2hsBar() {
  const offer = useOffer()
  const { sheet, setSheet, click } = useInstallClick()
  if ((!offer || isDismissed()) && !sheet) return null
  return (
    <>
      {offer && !isDismissed() ? (
        <div className="a2hs-bar">
          <img src="/logo/ln-icon-48.png" alt="" width="32" height="32" />
          <span>Get Listing Needed on your phone</span>
          <button type="button" className="btn primary a2hs-add" onClick={click}>Add to Home Screen</button>
          <button type="button" className="a2hs-x" aria-label="Dismiss" onClick={dismiss}>×</button>
        </div>
      ) : null}
      {sheet ? <IosSheet onClose={() => setSheet(false)} /> : null}
    </>
  )
}
