<script>
  import { goto } from '$app/navigation';
  export let mode = 'login';

  let email = '';
  let password = '';
  let name = '';
  let message = '';
  let busy = false;

  const endpoint = {
    login: '/api/auth/login',
    register: '/api/auth/register',
    forgot: '/api/auth/forgot-password',
    reset: '/api/auth/reset-password',
    verify: '/api/auth/verify-email/confirm',
  }[mode];

  async function submit(event) {
    event.preventDefault();
    busy = true;
    message = '';

    const payload = { email, password };
    if (mode === 'login') {
      payload.username = email;
    }
    if (mode === 'register') {
      payload.username = email;
      payload.name = name;
    }
    if (mode === 'forgot') delete payload.password;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || data?.details || 'Request failed');
      }
      message = 'Success';
      if (mode === 'login' || mode === 'register' || mode === 'verify') {
        await goto('/');
      }
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<section class="auth card">
  <h1>{mode === 'login' ? 'Login' : mode === 'register' ? 'Register' : mode === 'forgot' ? 'Forgot Password' : mode === 'reset' ? 'Reset Password' : 'Verify Email'}</h1>
  <form on:submit={submit}>
    {#if mode === 'register'}
      <input class="field" bind:value={name} placeholder="Name" required />
    {/if}
    <input class="field" bind:value={email} placeholder="Email" type="email" required />
    {#if mode !== 'forgot'}
      <input class="field" bind:value={password} placeholder="Password" type="password" required />
    {/if}
    <button class="pill submit" disabled={busy}>{busy ? '...' : 'Continue'}</button>
  </form>
  {#if message}<p class="msg">{message}</p>{/if}
</section>

<style>
  .auth {
    width: min(480px, calc(100vw - 32px));
    margin: 64px auto;
    padding: 20px;
    display: grid;
    gap: 12px;
  }
  form { display: grid; gap: 10px; }
  .field {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    background: rgba(12, 16, 24, 0.75);
  }
  .submit {
    padding: 12px;
    cursor: pointer;
    border-color: rgba(249, 115, 22, 0.45);
    background: rgba(249, 115, 22, 0.2);
  }
  .msg { color: var(--muted); margin: 0; }
</style>
