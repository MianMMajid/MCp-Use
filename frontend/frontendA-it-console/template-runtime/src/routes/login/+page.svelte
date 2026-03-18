<script>
  import { onMount, tick } from 'svelte'

  const DEFAULT_MAPLE_CHAT_HREF = '/maple/observability'

  function isSafeRedirect(url) {
    if (!url) return false
    try {
      const parsed = new URL(url, window.location.origin)
      if (parsed.origin === window.location.origin) return true
      // External SSO redirects must be HTTPS and from a known IdP host.
      // The backend /api/auth/sso/discover validates the IdP, so we trust
      // its returned URL if it uses HTTPS and is not a javascript: or data: scheme.
      return parsed.protocol === 'https:' && !parsed.username
    } catch {
      return false
    }
  }

  function isSameOriginRedirect(url) {
    if (!url) return false
    try {
      return new URL(url, window.location.origin).origin === window.location.origin
    } catch { return false }
  }

  let email = ''
  let password = ''
  let error = ''
  let loading = false
  let googleConfigured = false
  let showPassword = false

  // MFA challenge state
  let mfaRequired = false
  let mfaSessionToken = ''
  let mfaCode = ''
  let mfaRecoveryMode = false
  let mfaRecoveryCode = ''
  let mfaTrustDevice = false
  let mfaAttemptsRemaining = 5
  let mfaExpired = false
  let mfaCodeInput
  let mfaRecoveryInput

  // SSO state
  let ssoConfigured = false
  let ssoChecking = false
  let ssoRedirectUrl = ''

  async function focusActiveMfaInput() {
    await tick()
    if (!mfaRequired) return
    ;(mfaRecoveryMode ? mfaRecoveryInput : mfaCodeInput)?.focus()
  }

  onMount(async () => {
    try {
      const me = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (me.ok) {
        const payload = await me.json().catch(() => ({}))
        if (payload?.authenticated) {
          window.location.assign(DEFAULT_MAPLE_CHAT_HREF)
          return
        }
      }
    } catch {
      // frontend-only resilience
    }

    try {
      const google = await fetch('/api/auth/google/client-id', { credentials: 'same-origin' })
      if (google.ok) {
        const payload = await google.json()
        googleConfigured = Boolean(payload?.configured)
      }
    } catch {
      // ignore
    }
  })

  // Email-first SSO domain detection
  async function checkSsoDomain() {
    if (!email || !email.includes('@')) return
    ssoChecking = true
    try {
      const res = await fetch(`/api/auth/sso/discover?email=${encodeURIComponent(email)}`, { credentials: 'same-origin' })
      if (res.ok) {
        const data = await res.json()
        if (data?.ssoConfigured) {
          ssoConfigured = true
          ssoRedirectUrl = data.loginUrl || ''
        } else {
          ssoConfigured = false
        }
      }
    } catch {
      ssoConfigured = false
    } finally {
      ssoChecking = false
    }
  }

  function onEmailBlur() {
    checkSsoDomain()
  }

  async function handleSsoLogin() {
    if (ssoRedirectUrl && isSafeRedirect(ssoRedirectUrl)) {
      window.location.assign(ssoRedirectUrl)
    } else if (ssoRedirectUrl) {
      error = 'SSO redirect blocked: unexpected external URL.'
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    error = ''
    loading = true

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: email, password }),
      })

      const payload = await response.json().catch(() => ({}))

      if (response.ok) {
        if (payload?.mfaRequired) {
          // MFA challenge required
          mfaRequired = true
          mfaSessionToken = payload.mfaSessionToken
          mfaCode = ''
          mfaRecoveryMode = false
          error = ''
          focusActiveMfaInput()
          return
        }

        if (payload?.authenticated) {
          window.location.assign(DEFAULT_MAPLE_CHAT_HREF)
          return
        }
      }

      if (response.status === 401) {
        error = 'Invalid credentials'
      } else if (response.status === 429) {
        error = 'Too many login attempts. Please try again later.'
      } else {
        error = 'An unexpected error occurred. Please try again.'
      }
    } catch {
      error = 'Unable to connect. Please check your network and try again.'
    } finally {
      loading = false
      if (error) password = ''
    }
  }

  async function handleMfaSubmit(event) {
    event.preventDefault()
    if (loading) return
    error = ''
    loading = true

    try {
      const body = {
        mfaSessionToken,
        trustDevice: mfaTrustDevice,
      }
      if (mfaRecoveryMode) {
        body.recoveryCode = mfaRecoveryCode.replace(/\s/g, '')
      } else {
        body.code = mfaCode.replace(/\s/g, '')
      }

      const response = await fetch('/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })

      const payload = await response.json().catch(() => ({}))

      if (response.ok && payload?.authenticated) {
        window.location.assign(DEFAULT_MAPLE_CHAT_HREF)
        return
      }

      if (response.status === 429) {
        if (payload?.lockedUntil) {
          error = `Account temporarily locked. Try again in ${payload.retryAfter || 900} seconds.`
        } else {
          error = 'Too many failed attempts. Account locked for 15 minutes.'
        }
        mfaRequired = false
        return
      }

      if (response.status === 401) {
        if (payload?.error?.includes('expired')) {
          mfaExpired = true
          error = 'MFA session expired. Please log in again.'
          mfaRequired = false
          return
        }
        mfaAttemptsRemaining = payload?.attemptsRemaining ?? mfaAttemptsRemaining - 1
        error = mfaRecoveryMode ? 'Invalid recovery code.' : `Invalid code. ${mfaAttemptsRemaining} attempts remaining.`
      } else {
        error = payload?.error || 'MFA verification failed.'
      }
    } catch {
      error = 'Unable to connect. Please check your network and try again.'
    } finally {
      loading = false
    }
  }

  function backToLogin() {
    mfaRequired = false
    mfaSessionToken = ''
    mfaCode = ''
    mfaRecoveryMode = false
    mfaRecoveryCode = ''
    error = ''
    password = ''
  }

  // Auto-submit when 6 digits entered
  function onMfaCodeInput() {
    const cleaned = mfaCode.replace(/\s/g, '')
    if (cleaned.length === 6) {
      handleMfaSubmit(new Event('submit'))
    }
  }

  // Handle paste of 6-digit code
  function onMfaCodePaste(event) {
    const pasted = (event.clipboardData || window.clipboardData)?.getData('text') || ''
    const digits = pasted.replace(/\D/g, '').slice(0, 6)
    if (digits.length === 6) {
      event.preventDefault()
      mfaCode = digits
      setTimeout(() => handleMfaSubmit(new Event('submit')), 100)
    }
  }

  async function signInWithGoogle(credentialResponse) {
    error = ''
    const credential = credentialResponse?.credential || credentialResponse?.tokenId || ''
    if (!credential) { error = 'No Google credential received.'; return }
    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ credential }),
      })
      if (!response.ok) throw new Error('Google sign-in failed')
      const payload = await response.json()
      if (payload?.redirectUrl && isSameOriginRedirect(payload.redirectUrl)) {
        window.location.assign(payload.redirectUrl)
        return
      }
      if (payload?.authenticated) {
        window.location.assign(DEFAULT_MAPLE_CHAT_HREF)
      }
    } catch {
      error = 'Google sign-in failed. Please try again.'
    }
  }
</script>

<div class="login-wrap">
  <div class="login-card">
    <div class="brand-mark">
      <svg viewBox="0 0 32 32" width="48" height="48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <radialGradient id="mayple-brand" cx="45%" cy="38%" r="55%">
            <stop offset="0%" stop-color="#ffb366" />
            <stop offset="100%" stop-color="#e8740c" />
          </radialGradient>
        </defs>
        <circle cx="16" cy="14" r="12" fill="url(#mayple-brand)" />
        <ellipse cx="12" cy="12" rx="1.8" ry="2.2" fill="#111" />
        <ellipse cx="20" cy="12" rx="1.8" ry="2.2" fill="#111" />
        <circle cx="12.6" cy="11.2" r="0.7" fill="#fff" />
        <circle cx="20.6" cy="11.2" r="0.7" fill="#fff" />
        <ellipse cx="9" cy="16" rx="2.4" ry="1.6" fill="#ff9966" opacity="0.5" />
        <ellipse cx="23" cy="16" rx="2.4" ry="1.6" fill="#ff9966" opacity="0.5" />
        <path d="M13 17.5 Q16 20 19 17.5" stroke="#111" stroke-width="0.8" fill="none" stroke-linecap="round" />
        <ellipse cx="11" cy="27" rx="3.5" ry="2.2" fill="#d06800" />
        <ellipse cx="21" cy="27" rx="3.5" ry="2.2" fill="#d06800" />
      </svg>
      <h1>Mayple IT Console</h1>
    </div>

    {#if mfaRequired}
      <p>Two-factor authentication required</p>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <form on:submit={handleMfaSubmit}>
        {#if !mfaRecoveryMode}
          <label>
            Authenticator Code
            <input
              bind:this={mfaCodeInput}
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="6"
              autocomplete="one-time-code"
              bind:value={mfaCode}
              on:input={onMfaCodeInput}
              on:paste={onMfaCodePaste}
              placeholder="000000"
              required
            />
          </label>
        {:else}
          <label>
            Recovery Code
            <input
              bind:this={mfaRecoveryInput}
              type="text"
              bind:value={mfaRecoveryCode}
              placeholder="XXXX-XXXX"
              autocomplete="off"
              required
            />
          </label>
        {/if}

        <label class="checkbox-label">
          <input type="checkbox" bind:checked={mfaTrustDevice} />
          Trust this browser for 30 days
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Verifying...' : 'Verify'}
        </button>
      </form>

      <div class="mfa-links">
        {#if !mfaRecoveryMode}
          <button type="button" class="link-btn" on:click={() => { mfaRecoveryMode = true; error = ''; focusActiveMfaInput() }}>
            Use a recovery code instead
          </button>
        {:else}
          <button type="button" class="link-btn" on:click={() => { mfaRecoveryMode = false; error = ''; focusActiveMfaInput() }}>
            Use authenticator code
          </button>
        {/if}
        <button type="button" class="link-btn" on:click={backToLogin}>
          Back to login
        </button>
      </div>

    {:else}
      <p>Sign in to access the admin dashboard</p>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <form on:submit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            bind:value={email}
            on:blur={onEmailBlur}
            autocomplete="username"
            required
          />
        </label>

        {#if ssoChecking}
          <div class="sso-checking">
            <span class="spinner"></span> Checking for SSO configuration...
          </div>
        {/if}

        {#if !ssoConfigured}
          <label>
            Password
            <div class="password-wrap">
              <input type={showPassword ? 'text' : 'password'} bind:value={password} autocomplete="current-password" required />
              <button type="button" class="toggle-pw" aria-label={showPassword ? 'Hide password' : 'Show password'} on:click={() => (showPassword = !showPassword)}>
                {#if showPassword}
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22M14.12 14.12a3 3 0 1 1-4.24-4.24"></path></svg>
                {:else}
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"></path></svg>
                {/if}
              </button>
            </div>
          </label>
          <a href="/forgot-password" class="forgot-link">Forgot password?</a>
          <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        {:else}
          <button type="button" class="sso-btn" on:click={handleSsoLogin}>
            Continue with SSO
          </button>
          <button type="button" class="link-btn" on:click={() => { ssoConfigured = false }}>
            Use password instead
          </button>
        {/if}
      </form>

      {#if googleConfigured && !ssoConfigured}
        <div class="divider"><span>or</span></div>
        <button type="button" class="google-btn" on:click={signInWithGoogle}>Sign in with Google</button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .login-wrap { min-height: 100vh; display: grid; place-items: center; padding: 1rem; background: var(--bg, #fafafa); }
  .login-card { width: min(420px, 100%); background: var(--panel, #fff); border: 1px solid var(--line, #e4e4e7); border-radius: 12px; padding: 1.5rem; display: grid; gap: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .brand-mark { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .login-card h1 { margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--ink, #18181b); }
  .login-card p { margin: 0; color: var(--muted, #71717a); font-size: 0.875rem; }
  form { display: grid; gap: 0.75rem; }
  label { display: grid; gap: 0.3rem; font-size: 0.875rem; font-weight: 500; color: var(--ink, #18181b); }
  input[type="email"], input[type="password"], input[type="text"] { border: 1px solid var(--line-strong, #d4d4d8); border-radius: 8px; padding: 0.625rem 0.75rem; font-size: 0.875rem; background: var(--bg, #fff); color: var(--ink, #18181b); transition: border-color 150ms, box-shadow 150ms; }
  input[type="email"]::placeholder, input[type="password"]::placeholder, input[type="text"]::placeholder { color: var(--muted, #a1a1aa); }
  input[type="text"][inputmode="numeric"] { text-align: center; font-size: 1.5rem; letter-spacing: 0.3em; font-family: monospace; }
  button[type="submit"], .sso-btn { border-radius: 999px; padding: 0.625rem 1.25rem; border: none; background: #f59e0b; color: #fff; font-weight: 600; cursor: pointer; font-size: 0.875rem; transition: background 150ms; min-height: 40px; }
  button[type="submit"]:hover, .sso-btn:hover { background: #d97706; }
  button[type="submit"]:active { background: #b45309; }
  button[type="submit"]:disabled { opacity: 0.5; cursor: not-allowed; }
  .sso-btn { background: #f59e0b; }
  .google-btn { border-radius: 999px; padding: 0.625rem 1.25rem; border: 1px solid var(--line, #e4e4e7); background: var(--panel, #fff); color: var(--ink, #18181b); font-weight: 500; cursor: pointer; min-height: 40px; transition: background 150ms; }
  .google-btn:hover { background: var(--bg-soft, #f4f4f5); }
  .error { color: var(--warn, #dc2626); font-size: 0.8125rem; font-weight: 500; }
  .checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; cursor: pointer; color: var(--muted, #71717a); }
  .checkbox-label input[type="checkbox"] { width: auto; accent-color: #f59e0b; }
  .mfa-links { display: flex; flex-direction: column; gap: 0.3rem; }
  .link-btn { background: none; border: none; color: var(--brand, #f59e0b); font-size: 0.8125rem; cursor: pointer; text-align: left; padding: 0.2rem 0; }
  .link-btn:hover { text-decoration: underline; }
  .divider { display: flex; align-items: center; gap: 0.5rem; color: var(--muted, #a1a1aa); font-size: 0.75rem; }
  .divider::before, .divider::after { content: ''; flex: 1; border-top: 1px solid var(--line, #e4e4e7); }
  .sso-checking { display: flex; align-items: center; gap: 0.5rem; color: var(--muted, #71717a); font-size: 0.8125rem; padding: 0.3rem 0; }
  .spinner { width: 14px; height: 14px; border: 2px solid var(--line, #e4e4e7); border-top-color: var(--brand, #f59e0b); border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .password-wrap { position: relative; display: flex; }
  .password-wrap input { flex: 1; padding-right: 2.75rem; }
  .toggle-pw { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--muted, #a1a1aa); padding: 0.4rem; display: grid; place-items: center; border-radius: 6px; }
  .toggle-pw:hover { color: var(--ink, #18181b); }
  .forgot-link { font-size: 0.8125rem; color: var(--brand, #f59e0b); text-align: right; text-decoration: none; }
  .forgot-link:hover { text-decoration: underline; }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
