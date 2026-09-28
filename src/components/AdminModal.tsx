import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

/** Simple overlay dialog used by admin Edit / Delete-all flows. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-card${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** "Delete all" confirmation: the user must type DELETE. */
export function ConfirmDeleteAll({
  title,
  message,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  busy?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const ok = text.trim() === 'DELETE'
  function submit(e: FormEvent) {
    e.preventDefault()
    if (ok && !busy) void onConfirm()
  }
  return (
    <Modal title={title} onClose={onCancel}>
      <form className="modal-body" onSubmit={submit}>
        <div className="danger-note">{message}</div>
        <label>
          Type <strong>DELETE</strong> to confirm
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="DELETE"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn danger big-danger" disabled={!ok || busy}>
            {busy ? 'Deleting…' : title}
          </button>
        </div>
      </form>
    </Modal>
  )
}
