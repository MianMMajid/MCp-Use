<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';

  $: status = $page.status ?? 500;
  $: message = $page.error?.message ?? 'An unexpected error occurred.';

  $: if (browser && (status === 401 || status === 403)) {
    goto('/login', { replaceState: true });
  }

  function retry() {
    if (browser) window.location.reload();
  }
</script>

<div class="error-boundary">
  {#if status === 404}
    <h1>Page not found</h1>
    <p>The page you requested does not exist.</p>
    <nav class="error-links">
      <a href="/">Home</a>
      <a href="/agents">Agents</a>
      <a href="/settings">Settings</a>
    </nav>
  {:else if status === 429}
    <h1>Too many requests</h1>
    <p>You've been rate-limited. Wait a moment and try again.</p>
    <button type="button" class="retry-btn" on:click={retry}>Retry</button>
  {:else if status >= 500}
    <h1>Something went wrong</h1>
    <p>{message}</p>
    <p class="hint">The service may be temporarily unavailable.</p>
    <button type="button" class="retry-btn" on:click={retry}>Retry</button>
  {:else}
    <h1>Error {status}</h1>
    <p>{message}</p>
    <button type="button" class="retry-btn" on:click={retry}>Retry</button>
  {/if}
</div>

<style>
  .error-boundary {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: 2rem;
    text-align: center;
    font-family: 'Inter', system-ui, sans-serif;
    color: var(--fg, #1a1a1a);
  }
  h1 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }
  p {
    margin: 0.25rem 0;
    color: var(--muted, #6b7280);
    max-width: 40ch;
  }
  .hint {
    font-size: 0.875rem;
  }
  .error-links {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .error-links a {
    padding: 0.5rem 1rem;
    border-radius: 12px;
    background: var(--bg-soft, #f5f5f4);
    color: var(--accent, #e8740c);
    text-decoration: none;
    font-size: 0.875rem;
    border: 1px solid var(--border, #e5e7eb);
    transition: background 0.15s;
  }
  .error-links a:hover {
    background: var(--bg-elevated, #eeeeec);
  }
  .retry-btn {
    margin-top: 1.5rem;
    padding: 0.5rem 1.5rem;
    border-radius: 12px;
    border: 1px solid var(--border, #e5e7eb);
    background: var(--bg-soft, #f5f5f4);
    color: var(--fg, #1a1a1a);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .retry-btn:hover {
    background: var(--bg-elevated, #eeeeec);
  }
</style>
