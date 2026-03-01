'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Session', id: 'session' },
  { title: 'Login', id: 'login' },
  { title: 'Register', id: 'register' },
  { title: 'Google sign-in', id: 'google-sign-in' },
  { title: 'Password recovery', id: 'password-recovery' },
  { title: 'Email verification', id: 'email-verification' },
  { title: 'Logout', id: 'logout' },
]

export default function AuthAdminPage() {
  const [session, setSession] = useState(null)
  const [googleConfigured, setGoogleConfigured] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const [actionLoading, setActionLoading] = useState('')

  // Login form
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register form
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regUsername, setRegUsername] = useState('')

  // Google sign-in
  const [googleToken, setGoogleToken] = useState('')

  // Password recovery
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [resetNewPassword, setResetNewPassword] = useState('')

  // Email verification
  const [verifyEmail, setVerifyEmail] = useState('')
  const [verifyToken, setVerifyToken] = useState('')

  const fetchSession = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [me, gconf] = await Promise.allSettled([
        loadJson('/api/auth/me'),
        loadJson('/api/auth/google/client-id'),
      ])
      if (me.status === 'fulfilled') setSession(me.value)
      else setSession(null)
      if (gconf.status === 'fulfilled') setGoogleConfigured(gconf.value)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSession() }, [fetchSession])

  async function handleLogin() {
    if (!loginEmail || !loginPassword) return
    setActionLoading('login')
    setMessage('')
    try {
      const data = await postJson('/api/auth/login', { email: loginEmail, password: loginPassword })
      setMessage(`Login successful${data.token ? ' (token received)' : ''}`)
      fetchSession()
    } catch (err) { setMessage(`Login failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleRegister() {
    if (!regEmail || !regPassword) return
    setActionLoading('register')
    setMessage('')
    try {
      await postJson('/api/auth/register', { email: regEmail, password: regPassword, ...(regUsername ? { username: regUsername } : {}) })
      setMessage('Registration successful')
    } catch (err) { setMessage(`Registration failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleGoogleSignIn() {
    if (!googleToken) return
    setActionLoading('google')
    setMessage('')
    try {
      const data = await postJson('/api/auth/google', { token: googleToken })
      setMessage(`Google sign-in successful${data.token ? ' (token received)' : ''}`)
      fetchSession()
    } catch (err) { setMessage(`Google sign-in failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleForgotPassword() {
    if (!recoveryEmail) return
    setActionLoading('forgot')
    setMessage('')
    try {
      await postJson('/api/auth/forgot-password', { email: recoveryEmail })
      setMessage('Password reset email sent')
    } catch (err) { setMessage(`Forgot password failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleResetPassword() {
    if (!resetToken || !resetNewPassword) return
    setActionLoading('reset')
    setMessage('')
    try {
      await postJson('/api/auth/reset-password', { token: resetToken, password: resetNewPassword })
      setMessage('Password reset successful')
    } catch (err) { setMessage(`Reset failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleVerifyRequest() {
    if (!verifyEmail) return
    setActionLoading('verify-req')
    setMessage('')
    try {
      await postJson('/api/auth/verify-email/request', { email: verifyEmail })
      setMessage('Verification email sent')
    } catch (err) { setMessage(`Verification request failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleVerifyConfirm() {
    if (!verifyToken) return
    setActionLoading('verify-confirm')
    setMessage('')
    try {
      await postJson('/api/auth/verify-email/confirm', { token: verifyToken })
      setMessage('Email verified')
    } catch (err) { setMessage(`Verification failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleLogout() {
    setActionLoading('logout')
    setMessage('')
    try {
      await postJson('/api/auth/logout', {})
      setMessage('Logged out successfully')
      setSession(null)
    } catch (err) { setMessage(`Logout failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  const inputCls = 'w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white'
  const sectionCls = 'mt-10'
  const cardCls = 'mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900'

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Auth Admin</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Authentication endpoints: login, register, Google sign-in, password recovery, email verification, and session management.</p>
            </div>
            <Button variant="filled" onClick={fetchSession}>Refresh</Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
            </div>
          )}
          {message && <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">{message}</p>}

          {/* Session (GET /api/auth/me) */}
          <section id="session" className={sectionCls}>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Session</h2>
            <div className={cardCls}>
              {loading ? (
                <div className="animate-pulse h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
              ) : session ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Tag color="orange" variant="medium">Authenticated</Tag>
                    <span className="text-sm text-zinc-950 dark:text-white">{session.email || session.username || session.userId || 'Active session'}</span>
                  </div>
                  {session.plan && <p className="text-xs text-zinc-500">Plan: {session.plan}</p>}
                  {session.orgId && <p className="text-xs text-zinc-500">Org: {session.orgId}</p>}
                  <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{JSON.stringify(session, null, 2)}</pre>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Tag color="zinc" variant="medium">No session</Tag>
                  <span className="text-sm text-zinc-500">Not authenticated or session expired</span>
                </div>
              )}
            </div>
          </section>

          {/* Login (POST /api/auth/login) */}
          <section id="login" className={sectionCls}>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Login</h2>
            <div className={cardCls}>
              <div className="space-y-3">
                <input className={inputCls} value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Email" type="email" />
                <input className={inputCls} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Password" type="password" />
                <Button variant="filled" disabled={!loginEmail || !loginPassword || actionLoading === 'login'} onClick={handleLogin}>
                  {actionLoading === 'login' ? 'Logging in...' : 'Login'}
                </Button>
              </div>
            </div>
          </section>

          {/* Register (POST /api/auth/register) */}
          <section id="register" className={sectionCls}>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Register</h2>
            <div className={cardCls}>
              <div className="space-y-3">
                <input className={inputCls} value={regUsername} onChange={(e) => setRegUsername(e.target.value)} placeholder="Username (optional)" />
                <input className={inputCls} value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="Email" type="email" />
                <input className={inputCls} value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Password" type="password" />
                <Button variant="filled" disabled={!regEmail || !regPassword || actionLoading === 'register'} onClick={handleRegister}>
                  {actionLoading === 'register' ? 'Registering...' : 'Register'}
                </Button>
              </div>
            </div>
          </section>

          {/* Google Sign-In (GET /api/auth/google/client-id + POST /api/auth/google) */}
          <section id="google-sign-in" className={sectionCls}>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Google sign-in</h2>
            <div className={cardCls}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Google OAuth:</span>
                <Tag color={googleConfigured?.configured ? 'orange' : 'zinc'} variant="medium">
                  {googleConfigured?.configured ? 'Configured' : googleConfigured ? 'Not configured' : 'Unknown'}
                </Tag>
                {googleConfigured?.clientId && <span className="text-xs text-zinc-400">Client: {googleConfigured.clientId.slice(0, 20)}...</span>}
              </div>
              <div className="space-y-3">
                <input className={inputCls} value={googleToken} onChange={(e) => setGoogleToken(e.target.value)} placeholder="Google ID token" />
                <Button variant="filled" disabled={!googleToken || actionLoading === 'google'} onClick={handleGoogleSignIn}>
                  {actionLoading === 'google' ? 'Signing in...' : 'Sign in with Google'}
                </Button>
              </div>
            </div>
          </section>

          {/* Password Recovery (POST /api/auth/forgot-password + POST /api/auth/reset-password) */}
          <section id="password-recovery" className={sectionCls}>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Password recovery</h2>
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Forgot password</h3>
              <div className="mt-2 flex gap-2">
                <input className={`flex-1 ${inputCls}`} value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="Email" type="email" />
                <Button variant="secondary" disabled={!recoveryEmail || actionLoading === 'forgot'} onClick={handleForgotPassword}>
                  {actionLoading === 'forgot' ? 'Sending...' : 'Send Reset Email'}
                </Button>
              </div>
              <h3 className="mt-6 text-sm font-semibold text-zinc-950 dark:text-white">Reset password</h3>
              <div className="mt-2 space-y-3">
                <input className={inputCls} value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Reset token" />
                <input className={inputCls} value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} placeholder="New password" type="password" />
                <Button variant="filled" disabled={!resetToken || !resetNewPassword || actionLoading === 'reset'} onClick={handleResetPassword}>
                  {actionLoading === 'reset' ? 'Resetting...' : 'Reset Password'}
                </Button>
              </div>
            </div>
          </section>

          {/* Email Verification (POST /api/auth/verify-email/request + POST /api/auth/verify-email/confirm) */}
          <section id="email-verification" className={sectionCls}>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Email verification</h2>
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Request verification</h3>
              <div className="mt-2 flex gap-2">
                <input className={`flex-1 ${inputCls}`} value={verifyEmail} onChange={(e) => setVerifyEmail(e.target.value)} placeholder="Email" type="email" />
                <Button variant="secondary" disabled={!verifyEmail || actionLoading === 'verify-req'} onClick={handleVerifyRequest}>
                  {actionLoading === 'verify-req' ? 'Sending...' : 'Send Verification'}
                </Button>
              </div>
              <h3 className="mt-6 text-sm font-semibold text-zinc-950 dark:text-white">Confirm verification</h3>
              <div className="mt-2 flex gap-2">
                <input className={`flex-1 ${inputCls}`} value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="Verification token" />
                <Button variant="filled" disabled={!verifyToken || actionLoading === 'verify-confirm'} onClick={handleVerifyConfirm}>
                  {actionLoading === 'verify-confirm' ? 'Verifying...' : 'Confirm'}
                </Button>
              </div>
            </div>
          </section>

          {/* Logout (POST /api/auth/logout) */}
          <section id="logout" className={sectionCls}>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Logout</h2>
            <div className={cardCls}>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">End the current session and invalidate the auth token.</p>
              <Button variant="filled" disabled={actionLoading === 'logout'} onClick={handleLogout}>
                {actionLoading === 'logout' ? 'Logging out...' : 'Logout'}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </article>
  )
}
