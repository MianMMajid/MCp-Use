<script>
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { browser } from '$app/environment'

  $: status = $page.status ?? 500
  $: message = $page.error?.message ?? 'An unexpected error occurred.'

  $: if (browser && (status === 401 || status === 403)) {
    goto('/login', { replaceState: true })
  }

  function retry() {
    if (browser) window.location.reload()
  }
</script>

<div class="error-boundary">
  {#if status === 404}
    <h1>Route not found</h1>
    <p>The page you requested does not exist in this workspace.</p>
    <nav class="error-links">
      <a href="/maple">Workspace Home</a>
      <a href="/maple?category=observe&view=topology">Observe</a>
      <a href="/maple?category=admin&view=control">Admin</a>
      <a href="/maple?category=docs&view=overview">Docs</a>
    </nav>
  {:else if status >= 500}
    <h1>Backend unreachable</h1>
    <p>{message}</p>
    <p>The backend service may be temporarily unavailable.</p>
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
    color: var(--color-text, #e0e0e0);
    font-family: var(--font-sans, system-ui, sans-serif);
  }

  h1 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
    color: var(--color-heading, #fff);
  }

  p {
    margin: 0.25rem 0;
    opacity: 0.8;
    max-width: 40ch;
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
    border-radius: 6px;
    background: var(--color-surface, #1a1a2e);
    color: var(--color-link, #60a5fa);
    text-decoration: none;
    font-size: 0.875rem;
    transition: background 0.15s;
  }

  .error-links a:hover {
    background: var(--color-surface-hover, #252547);
  }

  .retry-btn {
    margin-top: 1.5rem;
    padding: 0.5rem 1.5rem;
    border-radius: 6px;
    border: 1px solid var(--color-border, #333);
    background: var(--color-surface, #1a1a2e);
    color: var(--color-text, #e0e0e0);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .retry-btn:hover {
    background: var(--color-surface-hover, #252547);
  }
</style>
