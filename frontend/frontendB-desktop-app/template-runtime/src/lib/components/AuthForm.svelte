<script>
  import { goto } from '$app/navigation';
  import { invalidateCache } from '@/lib/api';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import MaypleCharacter from '@/lib/components/MaypleCharacter.svelte';
  export let mode = 'login';
  export let token = '';

  let email = '';
  let password = '';
  let name = '';
  let error = '';
  let success = '';
  let busy = false;
  let showPassword = false;

  // Show missing-token error immediately for token-based flows
  $: if ((mode === 'reset' || mode === 'verify') && !token) {
    error = 'Invalid or missing link. Please request a new one.';
  }

  const titles = {
    login: 'Sign in',
    register: 'Create account',
    forgot: 'Reset your password',
    reset: 'Set new password',
    verify: 'Verify email',
  };

  const buttonLabels = {
    login: 'Sign in',
    register: 'Create account',
    forgot: 'Send reset link',
    reset: 'Update password',
    verify: 'Verify email',
  };

  const endpoint = {
    login: '/api/auth/login',
    register: '/api/auth/register',
    forgot: '/api/auth/forgot-password',
    reset: '/api/auth/reset-password',
    verify: '/api/auth/verify-email/confirm',
  }[mode];

  // Password strength (register or reset modes)
  $: strength = (() => {
    if (mode !== 'register' && mode !== 'reset') return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  $: strengthLabel = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  $: strengthColor = ['var(--danger)', 'var(--danger)', 'var(--caution)', 'var(--ok)', 'var(--ok)'][strength];

  // Fields shown per mode
  $: showEmail = mode === 'login' || mode === 'register' || mode === 'forgot';
  $: showName = mode === 'register';
  $: showPassword_ = mode === 'login' || mode === 'register' || mode === 'reset';

  async function submit(event) {
    event.preventDefault();
    busy = true;
    error = '';
    success = '';

    let payload;
    if (mode === 'login') {
      payload = { username: email, email, password };
    } else if (mode === 'register') {
      payload = { username: email, email, password, name };
    } else if (mode === 'forgot') {
      payload = { email, redirectUrl: `${window.location.origin}/reset-password` };
    } else if (mode === 'reset') {
      payload = { token, newPassword: password };
    } else if (mode === 'verify') {
      payload = { token };
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        if (res.status === 401) throw new Error('Invalid email or password.');
        if (res.status === 409) throw new Error('An account with this email already exists.');
        if (res.status === 429) throw new Error('Too many attempts. Please wait a moment and try again.');
        if (res.status === 404) throw new Error('No account found with this email.');
        if (res.status === 410) throw new Error('This link has expired or already been used. Please request a new one.');
        throw new Error(data?.error || data?.details || 'Something went wrong. Please try again.');
      }

      if (mode === 'forgot') {
        success = 'Reset link sent! Check your inbox.';
      } else if (mode === 'reset') {
        success = 'Password updated. You can now sign in.';
      } else if (mode === 'verify') {
        success = 'Email verified! Redirecting...';
        invalidateCache();
        setTimeout(() => goto('/'), 1500);
      } else if (mode === 'login' || mode === 'register') {
        invalidateCache();
        await goto('/');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<section class="auth card">
  <div class="brand">
    <MaypleCharacter size={56} animate={false} />
    <h1>{titles[mode]}</h1>
  </div>

  {#if error}
    <p class="error-msg" role="alert" aria-live="assertive">{error}</p>
  {/if}
  {#if success}
    <p class="success-msg" role="status">{success}</p>
  {/if}

  <form on:submit={submit}>
    {#if showName}
      <div class="field-group">
        <label for="auth-name">Full name</label>
        <input
          id="auth-name"
          class="field"
          bind:value={name}
          autocomplete="name"
          required
        />
      </div>
    {/if}

    {#if showEmail}
      <div class="field-group">
        <label for="auth-email">Email address</label>
        <input
          id="auth-email"
          class="field"
          bind:value={email}
          type="email"
          autocomplete={mode === 'login' ? 'username' : 'email'}
          required
        />
      </div>
    {/if}

    {#if showPassword_}
      <div class="field-group">
        <label for="auth-password">{mode === 'reset' ? 'New password' : 'Password'}</label>
        <div class="password-wrap">
          <input
            id="auth-password"
            class="field password-input"
            bind:value={password}
            type={showPassword ? 'text' : 'password'}
            autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
            minlength={mode === 'register' || mode === 'reset' ? 8 : undefined}
            aria-describedby={(mode === 'register' || mode === 'reset') && password.length > 0 ? 'password-strength' : undefined}
            required
          />
          <button
            type="button"
            class="toggle-pw"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            on:click={() => (showPassword = !showPassword)}
          >
            <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
          </button>
        </div>

        {#if (mode === 'register' || mode === 'reset') && password.length > 0}
          <div class="strength" id="password-strength">
            <div class="strength-bar">
              <div class="strength-fill" style="width: {strength * 25}%; background: {strengthColor}"></div>
            </div>
            <span class="strength-label" style="color: {strengthColor}">{strengthLabel}</span>
          </div>
        {/if}

        {#if mode === 'login'}
          <a href="/forgot-password" class="forgot-link">Forgot password?</a>
        {/if}
      </div>
    {/if}

    <button class="submit-btn" type="submit" disabled={busy || ((mode === 'reset' || mode === 'verify') && !token)}>
      {#if busy}
        <span class="spinner"><Icon name="loader" size={18} /></span>
      {:else}
        {buttonLabels[mode]}
      {/if}
    </button>
  </form>

  <div class="nav-links">
    {#if mode === 'login'}
      <span>Don't have an account? <a href="/register">Create one</a></span>
    {:else if mode === 'register'}
      <span>Already have an account? <a href="/login">Sign in</a></span>
    {:else if mode === 'forgot'}
      <span><a href="/login">Back to sign in</a></span>
    {:else if mode === 'reset'}
      <span><a href="/login">Back to sign in</a></span>
    {:else if mode === 'verify'}
      <span><a href="/login">Back to sign in</a></span>
    {/if}
  </div>
</section>

<style>
  .auth {
    width: min(440px, calc(100vw - 32px));
    padding: 28px 24px;
    display: grid;
    gap: 16px;
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }

  .brand h1 {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--fg);
  }

  form {
    display: grid;
    gap: 14px;
  }

  .field-group {
    display: grid;
    gap: 5px;
  }

  label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--fg);
  }

  .field {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    min-height: 44px;
    background: var(--bg-soft);
    font-size: 0.9rem;
    color: var(--fg);
    transition: border-color 150ms, box-shadow 150ms;
  }

  .field:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .password-wrap {
    position: relative;
    display: flex;
  }

  .password-input {
    flex: 1;
    padding-right: 44px;
  }

  .toggle-pw {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted);
    padding: 8px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    min-width: 36px;
    min-height: 36px;
  }

  .toggle-pw:hover {
    color: var(--fg);
  }

  .strength {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }

  .strength-bar {
    flex: 1;
    height: 4px;
    background: var(--border);
    border-radius: 4px;
    overflow: hidden;
  }

  .strength-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 200ms, background 200ms;
  }

  .strength-label {
    font-size: 0.75rem;
    font-weight: 600;
    min-width: 3.5em;
  }

  .forgot-link {
    font-size: 0.8rem;
    color: var(--accent);
    text-decoration: none;
    justify-self: end;
  }

  .forgot-link:hover {
    text-decoration: underline;
  }

  .submit-btn {
    padding: 12px;
    min-height: 44px;
    cursor: pointer;
    border: none;
    border-radius: 999px;
    background: linear-gradient(145deg, var(--accent-light), var(--accent));
    color: #fff;
    font-weight: 600;
    font-size: 0.9rem;
    transition: opacity 150ms;
    display: grid;
    place-items: center;
  }

  .submit-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .submit-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-flex;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-msg {
    margin: 0;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--danger-soft);
    border: 1px solid var(--danger-border);
    color: var(--danger);
    font-size: 0.85rem;
    font-weight: 500;
  }

  .success-msg {
    margin: 0;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--ok-soft);
    border: 1px solid var(--ok-border);
    color: var(--ok);
    font-size: 0.85rem;
    font-weight: 500;
  }

  .nav-links {
    text-align: center;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .nav-links a {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  .nav-links a:hover {
    text-decoration: underline;
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
  }
</style>
