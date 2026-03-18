<script>
  let email = ''
  let error = ''
  let success = ''
  let loading = false

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    error = ''
    success = ''
    loading = true

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, redirectUrl: `${window.location.origin}/reset-password` }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Too many attempts. Please wait a moment and try again.')
        }
        throw new Error(payload?.error || 'Something went wrong. Please try again.')
      }

      success = 'Reset link sent! Check your inbox.'
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  }
</script>

<div class="page-wrap">
  <div class="page-card">
    <h1>Reset your password</h1>
    <p>Enter your email address and we'll send you a link to reset your password.</p>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    {#if success}
      <p class="success" role="status">{success}</p>
    {/if}

    <form on:submit={handleSubmit}>
      <label>
        Email
        <input type="email" bind:value={email} autocomplete="email" required />
      </label>
      <button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send reset link'}</button>
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
  .page-card p { margin: 0; color: var(--muted, #71717a); font-size: 0.875rem; }
  form { display: grid; gap: 0.75rem; }
  label { display: grid; gap: 0.3rem; font-size: 0.875rem; font-weight: 500; color: var(--ink, #18181b); }
  input[type="email"] { border: 1px solid var(--line-strong, #d4d4d8); border-radius: 8px; padding: 0.625rem 0.75rem; font-size: 0.875rem; background: var(--bg, #fff); color: var(--ink, #18181b); min-height: 44px; transition: border-color 150ms, box-shadow 150ms; }
  button[type="submit"] { border-radius: 999px; padding: 0.625rem 1.25rem; border: none; background: #f59e0b; color: #fff; font-weight: 600; cursor: pointer; font-size: 0.875rem; transition: background 150ms; min-height: 44px; }
  button[type="submit"]:hover { background: #d97706; }
  button[type="submit"]:disabled { opacity: 0.5; cursor: not-allowed; }
  .error { color: var(--warn, #dc2626); font-size: 0.8125rem; font-weight: 500; }
  .success { color: var(--ok, #16a34a); font-size: 0.8125rem; font-weight: 500; }
  .nav-links { text-align: center; }
  .nav-links a { color: var(--brand, #f59e0b); font-size: 0.8125rem; text-decoration: none; }
  .nav-links a:hover { text-decoration: underline; }
</style>
