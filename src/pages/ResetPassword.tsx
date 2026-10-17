import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ADMIN_EMAIL,
  RECOVERY_EVENT,
  clearRecovery,
  recoveryFromPastedLink,
  requestPasswordReset,
  setNewPassword,
  takeRecovery,
  type Recovery,
} from '../lib/auth'

/** v49: landing page of Supabase's password-reset email. */
export default function ResetPassword() {
  const [rec, setRec] = useState<Recovery | null>(takeRecovery)
  const [pasted, setPasted] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const navigate = useNavigate()

  // v51: a reset link opened while this page is already showing
  useEffect(() => {
    const onRec = () => setRec(takeRecovery())
    window.addEventListener(RECOVERY_EVENT, onRec)
    return () => window.removeEventListener(RECOVERY_EVENT, onRec)
  }, [])

  async function sendNew() {
    setError('')
    setSent('')
    setBusy(true)
    try {
      await requestPasswordReset(ADMIN_EMAIL)
      clearRecovery()
      setRec(null)
      setSent('A new reset link was emailed to the admin address. Open the NEWEST “Reset your password” email and click its link (older emails stop working).')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email')
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (pw.length < 10) return setError('Use at least 10 characters.')
    if (pw !== pw2) return setError('The two passwords do not match.')
    setBusy(true)
    try {
      await setNewPassword(rec || {}, pw)
      navigate('/admin?pw=changed', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the password')
    } finally {
      setBusy(false)
    }
  }

  async function submitPasted(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      setRec(await recoveryFromPastedLink(pasted))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that link')
    } finally {
      setBusy(false)
    }
  }

  const invalid = !rec || rec.error || !rec.access_token
  return (
    <div className="card" style={{ maxWidth: 440 }}>
      <div className="body">
        <h1 style={{ margin: '0 0 .35rem' }}>Set a new password</h1>
        {invalid ? (
          <>
            {rec?.error ? (
              <p className="error" style={{ marginTop: '.5rem' }}>
                {rec.error} Each link works once, only the newest email works, and links expire after an hour.
              </p>
            ) : (
              <p className="meta">Open the newest “Reset your password” email and click its link to set a new password here.</p>
            )}
            {sent ? <div className="success" style={{ marginBottom: '.75rem' }}>{sent}</div> : null}
            {error ? <div style={{ color: '#b91c1c', fontSize: '0.92rem', marginBottom: '.5rem' }}>{error}</div> : null}
            <div className="form" style={{ boxShadow: 'none', border: 'none', padding: 0 }}>
              <button type="button" className="btn" disabled={busy} onClick={sendNew}>
                {busy && !showPaste ? 'Sending…' : 'Email me a new reset link'}
              </button>
              <button type="button" className="link-btn" onClick={() => setShowPaste((v) => !v)}>
                {showPaste ? 'Hide' : 'Or paste the link from the email'}
              </button>
            </div>
            {showPaste ? (
              <form className="form" style={{ boxShadow: 'none', border: 'none', padding: 0, marginTop: '.5rem' }} onSubmit={submitPasted}>
                <label>
                  Reset link from the email
                  <input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://…supabase.co/auth/v1/verify?token=…" autoComplete="off" spellCheck={false} required />
                </label>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Checking…' : 'Continue'}
                </button>
              </form>
            ) : null}
            <Link className="link-btn" to="/admin" onClick={clearRecovery}>
              Back to admin sign in
            </Link>
          </>
        ) : (
          <form className="form" style={{ boxShadow: 'none', border: 'none', padding: 0 }} onSubmit={submit}>
            <label>
              New password
              <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            </label>
            <label>
              Repeat new password
              <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
            </label>
            {error ? <div style={{ color: '#b91c1c', fontSize: '0.92rem' }}>{error}</div> : null}
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
