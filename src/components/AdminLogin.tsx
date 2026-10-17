import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ADMIN_EMAIL, requestPasswordReset, signIn, signOut } from '../lib/auth'
import { supabaseFetch } from '../lib/supabase'

/** Asks the database whether the logged-in user is the admin (same check RLS uses). */
export async function checkIsAdmin(): Promise<boolean> {
  const res = await supabaseFetch('/rest/v1/rpc/is_admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  return res.ok && (await res.json().catch(() => false)) === true
}

/** v49 admin login: email + password (Supabase Auth) with "Forgot password?". */
export default function AdminLogin({ notice }: { notice?: string }) {
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  async function login(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(email, password)
      if (!(await checkIsAdmin())) {
        await signOut()
        throw new Error('This account does not have admin access.')
      }
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function forgot(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSent('')
    setBusy(true)
    try {
      await requestPasswordReset(email || ADMIN_EMAIL)
      setSent(`If ${email || ADMIN_EMAIL} is the admin email, a reset link is on its way (check spam too).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card admin-login" style={{ maxWidth: 420 }}>
      <div className="body">
        <h1 style={{ margin: '0 0 .35rem' }}>Admin</h1>
        {mode === 'login' ? (
          <>
            <p className="meta">Sign in with the admin email and password.</p>
            {notice ? <div className="success" style={{ marginBottom: '.75rem' }}>{notice}</div> : null}
            <form className="form" style={{ boxShadow: 'none', border: 'none', padding: 0 }} onSubmit={login}>
              <label>
                Email
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label>
                Password
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              {error ? <div style={{ color: '#b91c1c', fontSize: '0.92rem' }}>{error}</div> : null}
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setMode('forgot')
                  setError('')
                }}
              >
                Forgot password?
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="meta">Enter the admin email. We’ll email a link to set a new password.</p>
            <form className="form" style={{ boxShadow: 'none', border: 'none', padding: 0 }} onSubmit={forgot}>
              <label>
                Email
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              {error ? <div style={{ color: '#b91c1c', fontSize: '0.92rem' }}>{error}</div> : null}
              {sent ? (
                <div className="success">
                  {sent} Then copy the email’s <strong>Reset password</strong> link and paste it on the{' '}
                  <Link to="/reset-password">reset page</Link>.
                </div>
              ) : null}
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setMode('login')
                  setError('')
                  setSent('')
                }}
              >
                Back to sign in
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
