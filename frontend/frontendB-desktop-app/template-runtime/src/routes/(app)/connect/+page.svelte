<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import { loadJson, postJson, invalidateCache } from '@/lib/api';
  import { toastStore } from '@/lib/stores/toast-store';
  import { humanizeError } from '@/lib/utils/error-display';
  import { formatDate } from '@/lib/format';

  let loading = true;
  let providers = [];
  let userIntegrations = [];
  let connectingProvider = '';

  async function load() {
    loading = true;
    try {
      const [catalog, connected] = await Promise.all([
        loadJson('/api/integrations/catalog').catch(() => ({ providers: [] })),
        loadJson('/api/integrations').catch(() => ({ integrations: [] })),
      ]);
      providers = (catalog?.providers || catalog?.items || []).filter(
        (p) => (p.defaultAuthType || p.auth_type) !== 'internal'
      );
      userIntegrations = connected?.integrations || connected?.items || [];
    } catch { /* silent */ }
    finally { loading = false; }
  }

  onMount(load);

  function status(providerId) {
    const match = userIntegrations.find((i) => i.provider === providerId);
    return match?.status === 'connected' ? 'connected' : 'disconnected';
  }

  function detail(providerId) {
    return userIntegrations.find((i) => i.provider === providerId) || null;
  }

  async function connect(providerId, authType) {
    connectingProvider = providerId;
    try {
      if (authType === 'oauth2') {
        const w = 600, h = 700;
        const left = (screen.width - w) / 2, top = (screen.height - h) / 2;
        const popup = window.open(
          `/api/integrations/${encodeURIComponent(providerId)}/oauth/start`,
          'maple-oauth',
          `width=${w},height=${h},left=${left},top=${top}`
        );
        const poll = setInterval(async () => {
          if (!popup || popup.closed) {
            clearInterval(poll);
            connectingProvider = '';
            invalidateCache('/api/integrations');
            await load();
          }
        }, 500);
      } else {
        const key = prompt(`Enter your ${providerId} API key:`);
        if (!key) { connectingProvider = ''; return; }
        const res = await postJson(`/api/integrations/${encodeURIComponent(providerId)}/connect`, { token: key });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Connection failed');
        }
        toastStore.success(`${providerId} connected`);
        invalidateCache('/api/integrations');
        await load();
      }
    } catch (err) {
      toastStore.error(humanizeError(err instanceof Error ? err.message : String(err)));
    } finally {
      if (connectingProvider === providerId) connectingProvider = '';
    }
  }

  async function disconnect(providerId) {
    try {
      const res = await postJson(`/api/integrations/${encodeURIComponent(providerId)}/disconnect`, {});
      if (!res.ok) throw new Error('Disconnect failed');
      toastStore.success(`${providerId} disconnected`);
      invalidateCache('/api/integrations');
      await load();
    } catch (err) {
      toastStore.error(humanizeError(err instanceof Error ? err.message : String(err)));
    }
  }
</script>

<AppShell>
  <section class="connect-page">
    <header class="page-header">
      <h1>Connect</h1>
      <p class="subtitle">Link AI providers and external platforms so your agents can use them.</p>
    </header>

    {#if loading}
      <p class="muted">Loading integrations...</p>
    {:else if providers.length === 0}
      <p class="muted">No integrations available.</p>
    {:else}
      <div class="provider-grid">
        {#each providers as p}
          {@const id = p.id || p.provider}
          {@const authType = p.defaultAuthType || p.auth_type || 'token'}
          {@const isConnected = status(id) === 'connected'}
          {@const info = detail(id)}
          <div class="provider-card" class:connected={isConnected}>
            <div class="provider-top">
              <span class="provider-name">{p.displayName || p.name || id}</span>
              <span class="provider-badge" class:badge-connected={isConnected}>
                {isConnected ? 'Connected' : authType === 'oauth2' ? 'OAuth' : 'API Key'}
              </span>
            </div>
            {#if isConnected && info?.connectedAt}
              <p class="provider-meta">Since {formatDate(info.connectedAt)}</p>
            {/if}
            <div class="provider-actions">
              {#if isConnected}
                <button class="pill danger-outline" on:click={() => disconnect(id)}>Disconnect</button>
              {:else}
                <button
                  class="pill cta"
                  disabled={connectingProvider === id}
                  on:click={() => connect(id, authType)}
                >
                  {connectingProvider === id ? 'Connecting...' : 'Connect'}
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</AppShell>

<style>
  .connect-page { min-height: calc(100svh - 92px); }
  .page-header { margin-bottom: 20px; }
  .page-header h1 { margin: 0; font-size: 1.3rem; }
  .subtitle { margin: 4px 0 0; font-size: 13px; color: var(--muted); }

  .provider-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
  }

  .provider-card {
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
    display: grid;
    gap: 10px;
    transition: border-color 0.15s;
  }

  .provider-card.connected { border-color: var(--ok-border); }

  .provider-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .provider-name { font-size: 14px; font-weight: 600; }

  .provider-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--muted);
  }

  .provider-badge.badge-connected {
    border-color: var(--ok-border);
    background: var(--ok-soft);
    color: var(--ok);
  }

  .provider-meta { margin: 0; font-size: 11px; color: var(--muted); }

  .provider-actions { display: flex; gap: 8px; }

  .danger-outline {
    border-color: var(--danger-border) !important;
    color: var(--danger) !important;
    background: transparent !important;
    font-size: 12px;
    cursor: pointer;
  }

  .danger-outline:hover { background: var(--danger-soft) !important; }

  .muted { color: var(--muted); font-size: 13px; }

  @media (max-width: 480px) {
    .provider-grid { grid-template-columns: 1fr; }
  }
</style>
