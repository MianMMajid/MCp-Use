<script>
  import { onMount } from 'svelte'

  const DEFAULT_MAPLE_CHAT_HREF =
    '/maple?category=chat&view=chat&route=%2Fmaple%2Fobservability'

  let email = ''
  let password = ''
  let error = ''
  let loading = false
  let googleConfigured = false

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

      if (response.ok) {
        const payload = await response.json()
        if (payload?.authenticated) {
          window.location.assign(DEFAULT_MAPLE_CHAT_HREF)
          return
        }
      }

      if (response.status === 401) {
        error = 'Invalid username or password'
      } else if (response.status === 429) {
        error = 'Too many login attempts. Please try again later.'
      } else {
        error = 'An unexpected error occurred. Please try again.'
      }
    } catch {
      error = 'Unable to connect. Please check your network and try again.'
    } finally {
      loading = false
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
      if (payload?.redirectUrl) {
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
    <h1>Mayple IT Console</h1>
    <p>Sign in to access the admin dashboard</p>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <form on:submit={handleSubmit}>
      <label>
        Email
        <input type="email" bind:value={email} required />
      </label>
      <label>
        Password
        <input type="password" bind:value={password} required />
      </label>
      <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
    </form>

    {#if googleConfigured}
      <button type="button" on:click={signInWithGoogle}>Sign in with Google</button>
    {/if}
  </div>
</div>

<style>
  .login-wrap { min-height: 100vh; display: grid; place-items: center; padding: 1rem; background: #f6f6f5; }
  .login-card { width: min(420px, 100%); background: #fff; border: 1px solid #ddd; border-radius: 14px; padding: 1rem; display: grid; gap: 0.75rem; }
  form { display: grid; gap: 0.75rem; }
  label { display: grid; gap: 0.3rem; font-size: 0.9rem; }
  input { border: 1px solid #ccc; border-radius: 10px; padding: 0.6rem; }
  button { border-radius: 10px; padding: 0.65rem; border: 1px solid #c96c16; background: #e8740c; color: #fff; font-weight: 600; }
  .error { color: #b00020; }
</style>
