<script>
  import { page } from '$app/stores'

  let password = ''
  let error = ''
  let success = ''
  let loading = false
  let showPassword = false

  $: token = $page.url.searchParams.get('token') || ''
  $: if (!token) {
    error = 'Invalid or missing link. Please request a new one.'
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading || !token) return
    error = ''
    success = ''
    loading = true

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, newPassword: password }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (response.status === 410) {
          throw new Error('This link has expired or already been used. Please request a new one.')
        }
        if (response.status === 429) {
          throw new Error('Too many attempts. Please wait a moment and try again.')
        }
        throw new Error(payload?.error || 'Something went wrong. Please try again.')
      }

      success = 'Password updated. You can now sign in.'
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  }
</script>

<div class="page-wrap">
  <div class="page-card">
    <h1>Set new password</h1>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    {#if success}
      <p class="success" role="status">{success}</p>
    {/if}

    <form on:submit={handleSubmit}>
      <label>
        New password
        <div class="password-wrap">
          <input
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            autocomplete="new-password"
            minlength="8"
            required
          />
          <button type="button" class="toggle-pw" aria-label={showPassword ? 'Hide password' : 'Show password'} on:click={() => (showPassword = !showPassword)}>
            {#if showPassword}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22M14.12 14.12a3 3 0 1 1-4.24-4.24"></path></svg>
            {:else}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"></path></svg>
            {/if}
          </button>
        </div>
      </label>
      <button type="submit" disabled={loading || !token}>{loading ? 'Updating...' : 'Update password'}</button>
    </form>

    <div class="nav-links">
      <a href="/login">Back to sign in</a>
    </div>
  </div>
</div>

<style>
  .page-wrap { min-height: 100vh; display: grid; place-items: center; padding: 1rem; background: var(--bg, #fafafa); }
  .page-card { width: min(420px, 100%); background: var(--panel, #fff); border: 1px solid var(--line, #e4e4e7); border-radius: 12px; padding: 1.5rem; display: grid; gap: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .page-card h1 { margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--ink, #18181b); }
  form { display: grid; gap: 0.75rem; }
  label { display: grid; gap: 0.3rem; font-size: 0.875rem; font-weight: 500; color: var(--ink, #18181b); }
  input[type="password"], input[type="text"] { border: 1px solid var(--line-strong, #d4d4d8); border-radius: 8px; padding: 0.625rem 0.75rem; font-size: 0.875rem; background: var(--bg, #fff); color: var(--ink, #18181b); min-height: 44px; transition: border-color 150ms, box-shadow 150ms; }
  .password-wrap { position: relative; display: flex; }
  .password-wrap input { flex: 1; padding-right: 2.75rem; }
  .toggle-pw { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--muted, #a1a1aa); padding: 0.4rem; display: grid; place-items: center; border-radius: 6px; }
  .toggle-pw:hover { color: var(--ink, #18181b); }
  button[type="submit"] { border-radius: 999px; padding: 0.625rem 1.25rem; border: none; background: #f59e0b; color: #fff; font-weight: 600; cursor: pointer; font-size: 0.875rem; transition: background 150ms; min-height: 44px; }
  button[type="submit"]:hover { background: #d97706; }
  button[type="submit"]:disabled { opacity: 0.5; cursor: not-allowed; }
  .error { margin: 0; color: var(--warn, #dc2626); font-size: 0.8125rem; font-weight: 500; }
  .success { margin: 0; color: var(--ok, #16a34a); font-size: 0.8125rem; font-weight: 500; }
  .nav-links { text-align: center; }
  .nav-links a { color: var(--brand, #f59e0b); font-size: 0.8125rem; text-decoration: none; }
  .nav-links a:hover { text-decoration: underline; }
</style>
