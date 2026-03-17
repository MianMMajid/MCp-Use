<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, postJson, invalidateCache } from '@/lib/api';

  let loading = true;
  let error = '';
  let search = '';
  let items = [];
  let smokeTests = {};

  // Marketplace drawer
  let drawerOpen = false;
  let marketplaceItems = [];
  let marketplaceLoading = false;
  let marketplaceError = '';
  let marketplaceSearch = '';
  let installing = {};
  let apiKeys = {};
  let expandedServer = null;

  $: installedCount = items.filter((i) => i.source !== 'openclaw-cli').length;
  $: cliCount = items.filter((i) => i.source === 'openclaw-cli').length;
  $: filtered = items.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.description || '').toLowerCase().includes(q) ||
      String(item.toolId || '').toLowerCase().includes(q)
    );
  });

  function sourceLabel(skill) {
    if (skill.source === 'mcp-registry') return 'mcp';
    if (skill.source === 'zip-upload') return 'bundle';
    if (skill.source === 'registry' || skill.source === 'manual') return 'manual';
    return 'cli';
  }

  function badgeColor(skill) {
    if (skill.source === 'mcp-registry') return 'green';
    if (skill.source === 'openclaw-cli') return 'sky';
    return 'zinc';
  }

  function isInstalled(serverName) {
    const toolId = serverName.replace(/[^a-zA-Z0-9._:-]/g, '-');
    return items.some((item) => item.toolId === toolId || item.toolId === serverName);
  }

  async function refresh() {
    loading = true;
    error = '';
    try {
      const data = await loadJson('/api/skills');
      items = data?.items || [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function openMarketplace() {
    drawerOpen = true;
    if (marketplaceItems.length === 0) loadMarketplace();
  }

  async function loadMarketplace() {
    marketplaceLoading = true;
    marketplaceError = '';
    try {
      const params = new URLSearchParams();
      if (marketplaceSearch) params.set('q', marketplaceSearch);
      params.set('transport', 'remote');
      const data = await loadJson(`/api/skills/marketplace?${params}`);
      marketplaceItems = data?.items || [];
    } catch (err) {
      marketplaceError = err instanceof Error ? err.message : String(err);
    } finally {
      marketplaceLoading = false;
    }
  }

  function toggleExpand(server) {
    expandedServer = expandedServer === server.name ? null : server.name;
  }

  async function installServer(server) {
    installing = { ...installing, [server.name]: true };
    try {
      const body = { name: server.name };
      if (apiKeys[server.name]) body.apiKey = apiKeys[server.name];
      const res = await postJson('/api/skills/marketplace/install', body);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        installing = { ...installing, [server.name]: false };
        return;
      }
      installing = { ...installing, [server.name]: 'done' };
      expandedServer = null;
      invalidateCache('/api/skills');
      await refresh();
    } catch {
      installing = { ...installing, [server.name]: false };
    }
  }

  async function runSmokeTest(skillId) {
    smokeTests = { ...smokeTests, [skillId]: { loading: true, result: null, error: '' } };
    try {
      const response = await postJson(`/api/skills/${skillId}/smoke-test`, {});
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        smokeTests = { ...smokeTests, [skillId]: { loading: false, result: null, error: payload?.error || 'Failed' } };
        return;
      }
      smokeTests = { ...smokeTests, [skillId]: { loading: false, result: payload.result, error: '' } };
    } catch (err) {
      smokeTests = { ...smokeTests, [skillId]: { loading: false, result: null, error: err instanceof Error ? err.message : String(err) } };
    }
  }

  onMount(refresh);
</script>

<AppShell>
  <section class="page">

    <!-- Header -->
    <div class="card header">
      <div class="title-wrap">
        <h1>Skills</h1>
        <p>{installedCount} installed · {cliCount} built-in</p>
      </div>
      <div class="meta-row">
        <button class="pill tiny" on:click={refresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button class="pill tiny cta" on:click={openMarketplace}>Browse Marketplace</button>
      </div>
    </div>

    <!-- Search -->
    <div class="card search">
      <span class="search-icon">⌕</span>
      <input bind:value={search} placeholder="Filter skills…" />
    </div>

    <!-- Grid -->
    {#if error}
      <p class="empty" style="color: #fb7185;">{error}</p>
    {:else if loading}
      <p class="empty">Loading skills…</p>
    {:else if filtered.length === 0}
      <div class="empty">
        <p>No skills found</p>
        <p style="margin-top:6px;">Install MCP servers from the marketplace.</p>
        <button class="pill tiny cta" style="margin-top:10px;" on:click={openMarketplace}>Open Marketplace</button>
      </div>
    {:else}
      <div class="grid">
        {#each filtered as skill}
          <article class="card agent">
            <div class="top-row">
              <p class="name">{skill.name}</p>
              <span class="badge {badgeColor(skill)}">{sourceLabel(skill)}</span>
            </div>
            <p class="desc">{skill.description}</p>
            {#if skill.tags?.length > 0}
              <div class="tags">
                {#each skill.tags.slice(0, 4) as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            {/if}
            <div class="meta">
              <span class="dot" class:dot-on={skill.status === 'connected'} class:dot-warn={skill.status === 'degraded'}></span>
              <span class="model">{skill.status}</span>
              <span style="flex:1"></span>
              <button class="pill tiny" on:click={() => runSmokeTest(skill.toolId)} disabled={smokeTests[skill.toolId]?.loading}>
                {smokeTests[skill.toolId]?.loading ? 'Testing…' : 'Test'}
              </button>
            </div>
            {#if smokeTests[skill.toolId]?.error}
              <p class="test-msg" style="color:#fb7185;">{smokeTests[skill.toolId].error}</p>
            {/if}
            {#if smokeTests[skill.toolId]?.result}
              <p class="test-msg" class:pass={smokeTests[skill.toolId].result.passed} class:fail={!smokeTests[skill.toolId].result.passed}>
                {smokeTests[skill.toolId].result.passed ? 'PASS' : 'FAIL'}
              </p>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Marketplace Drawer -->
  {#if drawerOpen}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="drawer-backdrop" on:click={() => drawerOpen = false}></div>
    <aside class="drawer">
      <div class="drawer-top">
        <div>
          <h2>MCP Marketplace</h2>
          <p class="sub">Remote servers from the official MCP registry</p>
        </div>
        <button class="pill tiny" on:click={() => drawerOpen = false}>✕</button>
      </div>

      <div class="drawer-search">
        <input
          placeholder="Search servers…"
          bind:value={marketplaceSearch}
          on:keydown={(e) => e.key === 'Enter' && loadMarketplace()}
        />
        <button class="pill tiny cta" on:click={loadMarketplace} disabled={marketplaceLoading}>
          {marketplaceLoading ? '…' : 'Search'}
        </button>
      </div>

      <div class="drawer-list">
        {#if marketplaceError}
          <p class="empty" style="color:#fb7185;">{marketplaceError}</p>
        {/if}

        {#if marketplaceLoading && marketplaceItems.length === 0}
          <p class="empty">Searching registry…</p>
        {:else if marketplaceItems.length === 0 && !marketplaceLoading}
          <p class="empty">No servers found.</p>
        {:else}
          {#each marketplaceItems as server}
            <article class="mp-item">
              <div class="mp-head">
                <div class="mp-info">
                  <p class="mp-name">
                    {server.title || server.name}
                    {#if server.requiresAuth}<span class="auth-badge">key required</span>{/if}
                  </p>
                  <span class="mp-id">{server.name}</span>
                </div>
                {#if isInstalled(server.name)}
                  <span class="badge green">installed</span>
                {:else if expandedServer === server.name}
                  <button class="pill tiny" on:click={() => toggleExpand(server)}>Cancel</button>
                {:else}
                  <button class="pill tiny cta" on:click={() => toggleExpand(server)}>
                    Install
                  </button>
                {/if}
              </div>
              <p class="mp-desc">{server.description}</p>
              {#if server.tools.length > 0}
                <div class="tags">
                  {#each server.tools.slice(0, 4) as tool}
                    <span class="tag">{tool.name}</span>
                  {/each}
                  {#if server.tools.length > 4}<span class="tag" style="color:var(--muted)">+{server.tools.length - 4}</span>{/if}
                </div>
              {/if}
              {#if expandedServer === server.name}
                <div class="auth-section">
                  {#if server.authHeaders?.[0]?.description}
                    <p class="auth-desc">{@html server.authHeaders[0].description.replace(/(https?:\/\/[^\s),]+)/g, '<a href="$1" target="_blank">$1</a>')}</p>
                  {/if}
                  <div class="auth-links">
                    {#if server.websiteUrl && !server.websiteUrl.includes('run.mcp.com') && !server.websiteUrl.includes('/mcp')}
                      <a href={server.websiteUrl} target="_blank" class="auth-hint link">Website & docs ↗</a>
                    {/if}
                    {#if server.repository}
                      <a href={server.repository} target="_blank" class="auth-hint link">GitHub repo ↗</a>
                    {/if}
                  </div>
                  <div class="auth-row">
                    <input
                      type="password"
                      placeholder="API key"
                      bind:value={apiKeys[server.name]}
                      on:keydown={(e) => e.key === 'Enter' && installServer(server)}
                    />
                    <button
                      class="pill tiny cta"
                      on:click={() => installServer(server)}
                      disabled={!!installing[server.name] || (server.requiresAuth && !apiKeys[server.name])}
                    >
                      {installing[server.name] === 'done' ? '✓' : installing[server.name] ? '…' : 'Connect'}
                    </button>
                  </div>
                  {#if server.requiresAuth}
                    <span class="auth-hint warn">API key required to use this server</span>
                  {:else}
                    <span class="auth-hint">Most servers need an API key — check their docs if you get auth errors</span>
                  {/if}
                </div>
              {/if}
            </article>
          {/each}
          <p class="empty" style="padding:8px 0;">{marketplaceItems.length} servers</p>
        {/if}
      </div>
    </aside>
  {/if}
</AppShell>

<style>
  .page {
    min-height: calc(100svh - 24px);
    display: grid;
    gap: 10px;
    align-content: start;
    grid-auto-rows: min-content;
  }

  /* ── Header ─────────────────────── */
  .header {
    padding: 8px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-height: 0;
  }
  .title-wrap { min-width: 0; }
  h1 { margin: 0; font-size: 1.06rem; }
  .title-wrap p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .meta-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }

  /* ── Shared ─────────────────────── */
  .tiny { padding: 5px 8px; font-size: 12px; cursor: pointer; }
  .cta { border-color: rgba(249, 115, 22, 0.55); background: rgba(249, 115, 22, 0.2); }
  .cta:hover { background: rgba(249, 115, 22, 0.3); }

  /* ── Search ─────────────────────── */
  .search {
    min-height: 0;
    height: 44px;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .search-icon { color: var(--muted); font-size: 15px; }
  .search input { width: 100%; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 14px; }

  /* ── Grid ────────────────────────── */
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }

  .agent {
    text-align: left;
    padding: 12px;
    border-radius: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .agent:hover { border-color: rgba(249, 115, 22, 0.42); background: rgba(29, 34, 45, 0.85); }

  .top-row { display: flex; align-items: center; gap: 8px; }
  .name { flex: 1; margin: 0; font-size: 14px; font-weight: 600; }
  .desc { margin: 0; color: var(--muted); font-size: 12px; min-height: 28px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

  .meta { margin-top: auto; padding-top: 6px; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
  .model { color: var(--muted); font-size: 11px; }

  /* ── Badges ─────────────────────── */
  .badge { border-radius: 999px; padding: 2px 8px; font-size: 10px; border: 1px solid transparent; text-transform: lowercase; }
  .green { color: #10b981; background: rgba(16, 185, 129, 0.14); border-color: rgba(16, 185, 129, 0.3); }
  .sky { color: #38bdf8; background: rgba(56, 189, 248, 0.14); border-color: rgba(56, 189, 248, 0.3); }
  .zinc { color: #d4d4d8; background: rgba(212, 212, 216, 0.1); border-color: rgba(212, 212, 216, 0.22); }

  /* ── Tags ────────────────────────── */
  .tags { display: flex; gap: 4px; flex-wrap: wrap; }
  .tag { font-size: 10px; padding: 2px 6px; border-radius: 6px; background: rgba(25, 29, 38, 0.7); border: 1px solid var(--border); color: var(--muted); }

  /* ── Status dot ─────────────────── */
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); flex-shrink: 0; }
  .dot-on { background: #10b981; box-shadow: 0 0 6px rgba(16, 185, 129, 0.4); }
  .dot-warn { background: var(--accent); box-shadow: 0 0 6px var(--accent-soft); }

  /* ── Test messages ──────────────── */
  .test-msg { font-size: 11px; margin: 0; }
  .pass { color: #10b981; }
  .fail { color: #fb7185; }

  .empty { padding: 20px; color: var(--muted); grid-column: 1 / -1; text-align: center; font-size: 13px; }
  h2 { margin: 0; font-size: 1rem; }
  .sub { margin: 2px 0 0; color: var(--muted); font-size: 12px; }

  /* ── Drawer ─────────────────────── */
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 900;
    animation: fadeIn .15s ease;
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    width: min(440px, 90vw);
    height: 100vh;
    background: var(--bg);
    border-left: 1px solid var(--border);
    z-index: 901;
    display: flex;
    flex-direction: column;
    animation: slideIn .2s cubic-bezier(.16, 1, .3, 1);
    box-shadow: -12px 0 40px rgba(0, 0, 0, 0.4);
  }
  .drawer-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 14px 16px 0;
    flex-shrink: 0;
  }
  .drawer-search {
    display: flex;
    gap: 6px;
    padding: 12px 16px;
    flex-shrink: 0;
  }
  .drawer-search input {
    flex: 1;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-elevated);
    color: var(--fg);
    padding: 7px 12px;
    font-size: 13px;
    outline: none;
  }
  .drawer-search input:focus { border-color: var(--accent-soft); }
  .drawer-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ── Marketplace card ───────────── */
  .mp-item {
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--bg-elevated);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    transition: border-color .15s;
  }
  .mp-item:hover { border-color: rgba(249, 115, 22, 0.3); }
  .mp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .mp-info { min-width: 0; }
  .mp-name { margin: 0; font-size: 13px; font-weight: 600; }
  .mp-id { font-size: 10px; color: var(--muted); font-family: ui-monospace, monospace; }
  .mp-desc { font-size: 11px; color: var(--muted); line-height: 1.45; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .auth-badge { font-size: 9px; padding: 1px 5px; border-radius: 4px; background: rgba(251,146,60,.15); color: #fb923c; border: 1px solid rgba(251,146,60,.3); margin-left: 6px; vertical-align: middle; text-transform: uppercase; font-weight: 600; letter-spacing: .03em; }
  .auth-section { display: flex; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px solid var(--border); margin-top: 2px; }
  .auth-row { display: flex; gap: 6px; }
  .auth-row input { flex: 1; border: 1px solid rgba(249,115,22,.3); border-radius: 999px; background: rgba(249,115,22,.06); color: var(--fg); padding: 7px 12px; font-size: 12px; outline: none; font-family: ui-monospace, monospace; }
  .auth-row input:focus { border-color: rgba(249,115,22,.5); }
  .auth-row input::placeholder { color: var(--muted); font-family: inherit; font-size: 11px; }
  .auth-desc { font-size: 11px; color: var(--muted); line-height: 1.5; margin: 0; word-break: break-word; }
  .auth-desc :global(a) { color: var(--accent); text-decoration: underline; }
  .auth-links { display: flex; gap: 10px; }
  .auth-hint { font-size: 10px; color: var(--muted); }
  .auth-hint.warn { color: #fb923c; }
  .auth-hint.link { color: var(--accent); text-decoration: underline; font-size: 11px; }

  /* ── Animations ─────────────────── */
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

  @media (max-width: 640px) {
    .header { flex-direction: column; align-items: flex-start; }
    .grid { grid-template-columns: 1fr; }
    .drawer { width: 100vw; }
  }
</style>
