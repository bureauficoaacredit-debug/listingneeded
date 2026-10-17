import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearRecovery, setNewPassword, takeRecovery } from '../lib/auth'

/** v49: landing page of Supabase's password-reset email. */
export default function ResetPassword() {
  const [rec] = useState(takeRecovery)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

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

  const invalid = !rec || rec.error || !rec.access_token
  return (
    <div className="card" style={{ maxWidth: 440 }}>
      <div className="body">
        <h1 style={{ margin: '0 0 .35rem' }}>Set a new password</h1>
        {invalid ? (
          <>
            <p className="error" style={{ marginTop: '.5rem' }}>
              {rec?.error || 'Open this page from the reset link in your email.'} Links work once and expire after an hour.
            </p>
            <Link className="btn" to="/admin" onClick={clearRecovery}>
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
