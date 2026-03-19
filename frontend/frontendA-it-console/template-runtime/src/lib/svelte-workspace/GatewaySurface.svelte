<script>
  import { onMount } from 'svelte'

  import { loadMany, sendJson, pickItems } from '../api/maple-api.js'
  import { degradedSecurityMessage } from '../maple-workspace/cyber-view-model.js'
  import { humanizeError } from '../utils/error-display.js'

  const REQUESTS = Object.freeze([
    ['firewallRules', '/api/firewall/rules/effective'],
    ['firewallState', '/api/firewall/state'],
    ['runtimeCapabilities', '/api/runtime/feature-capabilities'],
    ['cyberStatus', '/api/cyber/status'],
    ['cyberEvents', '/api/cyber/events?limit=5'],
    ['filesystemStatus', '/api/firewall/filesystem/status'],
    ['filesystemMutations', '/api/firewall/filesystem/mutations?limit=5'],
  ])

  let loading = true
  let error = ''
  let notice = ''
  let state = {}
  let previewInput = '{"command":"status","target":"agent-01","timeout":10}'
  let previewResult = null
  let busy = ''

  $: cyberStatus = state.cyberStatus?.value ?? {}
  $: cyberEvents = pickItems(state.cyberEvents?.value)
  $: filesystemMutations = pickItems(state.filesystemMutations?.value)
  $: systemNodes = [
    {
      label: 'Context-Wall',
      status: cyberStatus?.providers?.contextWall?.reachable ? 'ready' : 'degraded',
      detail: cyberStatus?.providers?.contextWall?.reason ?? 'policy boundary',
    },
    {
      label: 'MCP Proxy',
      status: cyberStatus?.providers?.mcpProxy?.reachable ? 'ready' : 'degraded',
      detail: cyberStatus?.providers?.mcpProxy?.reason ?? 'tool mediation',
    },
    {
      label: 'Cyber Proxy',
      status: cyberStatus?.providers?.cyberProxy?.reachable ? 'ready' : 'degraded',
      detail: cyberStatus?.providers?.cyberProxy?.reason ?? 'download inspection',
    },
    {
      label: 'Filesystem Guard',
      status: state.filesystemStatus?.value?.guard?.available === false ? 'degraded' : 'ready',
      detail: state.filesystemStatus?.value?.guard?.mode ?? 'mutation control',
    },
  ]

  async function refresh() {
    loading = true
    error = ''
    try {
      state = await loadMany(fetch, REQUESTS)
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      loading = false
    }
  }

  async function runPreview(enforce = false) {
    let body
    try {
      body = JSON.parse(previewInput)
    } catch {
      body = { input: previewInput }
    }
    busy = enforce ? 'enforce' : 'preview'
    error = ''
    notice = ''
    try {
      previewResult = await sendJson(fetch, enforce ? '/api/firewall/decision' : '/api/firewall/preview', body)
      notice = enforce ? 'Decision executed across the live firewall chain.' : 'Preview generated from the current control plane.'
      if (enforce) await refresh()
    } catch (requestError) {
      previewResult = null
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }

  function summarizeEvent(item) {
    return item?.title ?? item?.eventType ?? item?.type ?? item?.action ?? 'event'
  }

  function summarizeMutation(item) {
    return item?.taskText ?? item?.summary ?? item?.planId ?? 'mutation'
  }

  onMount(() => {
    refresh()
    const onShellRefresh = () => refresh()
    window.addEventListener('maple:shell-refresh', onShellRefresh)
    const intervalId = window.setInterval(refresh, 30000)
    return () => {
      window.removeEventListener('maple:shell-refresh', onShellRefresh)
      window.clearInterval(intervalId)
    }
  })
</script>

<section class="gateway-page">
  <header class="gateway-header">
    <div>
      <span class="gateway-kicker">Firewalls</span>
      <h1>Firewall Dashboard</h1>
      <p>Operate the live protection chain through a control-plane story, then preview or enforce decisions against the current backend state.</p>
    </div>
    <button type="button" class="gateway-refresh" on:click={refresh} disabled={loading}>Refresh</button>
  </header>

  {#if error}
    <p class="surface-error">{humanizeError(error)}</p>
  {/if}
  {#if notice}
    <p class="surface-notice">{notice}</p>
  {/if}

  <section class="gateway-story">
    {#each systemNodes as node, index}
      <article class={`story-node ${node.status}`}>
        <span>{node.label}</span>
        <strong>{node.status}</strong>
        <p>{node.detail}</p>
      </article>
      {#if index < systemNodes.length - 1}
        <div class="story-link">→</div>
      {/if}
    {/each}
  </section>

  <section class="gateway-grid">
    <article class="surface-panel">
      <div class="panel-head">
        <h2>Protection state</h2>
        <span class="chip">{degradedSecurityMessage(cyberStatus) || 'healthy'}</span>
      </div>
      <div class="metric-grid">
        <article class="metric-card">
          <span>Scan provider</span>
          <strong>{cyberStatus?.scanning?.provider ?? '--'}</strong>
        </article>
        <article class="metric-card">
          <span>Blocked / scanned</span>
          <strong>{cyberStatus?.recent?.blockedCount ?? 0} / {cyberStatus?.recent?.scannedCount ?? 0}</strong>
        </article>
        <article class="metric-card">
          <span>Open incidents</span>
          <strong>{cyberStatus?.security?.incidents?.open ?? 0}</strong>
        </article>
        <article class="metric-card">
          <span>Filesystem mode</span>
          <strong>{state.filesystemStatus?.value?.guard?.mode ?? '--'}</strong>
        </article>
      </div>

      <div class="activity-columns">
        <div class="activity-column">
          <h3>Recent cyber activity</h3>
          {#if cyberEvents.length === 0}
            <p class="empty-row">No cyber events returned.</p>
          {:else}
            {#each cyberEvents as item}
              <article class="activity-card">
                <strong>{summarizeEvent(item)}</strong>
                <span>{item.traceId ?? item.sessionId ?? '--'}</span>
              </article>
            {/each}
          {/if}
        </div>
        <div class="activity-column">
          <h3>Recent filesystem activity</h3>
          {#if filesystemMutations.length === 0}
            <p class="empty-row">No filesystem mutations returned.</p>
          {:else}
            {#each filesystemMutations as item}
              <article class="activity-card">
                <strong>{summarizeMutation(item)}</strong>
                <span>{item.status ?? item.lane ?? '--'}</span>
              </article>
            {/each}
          {/if}
        </div>
      </div>
    </article>

    <article class="surface-panel preview-panel">
      <div class="panel-head">
        <h2>Preview / enforce</h2>
        <span class="chip">live backend only</span>
      </div>
      <textarea class="editor" bind:value={previewInput} spellcheck="false"></textarea>
      <div class="actions">
        <button type="button" class="action-btn" on:click={() => runPreview(false)} disabled={busy === 'preview'}>Preview</button>
        <button type="button" class="action-btn primary" on:click={() => runPreview(true)} disabled={busy === 'enforce'}>Enforce</button>
      </div>
      <pre>{JSON.stringify(previewResult ?? state.firewallState?.value ?? {}, null, 2)}</pre>
    </article>
  </section>
</section>

<style>
  .gateway-page { display:grid; gap:var(--space-4, 16px); }
  .gateway-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
  .gateway-kicker { display:block; text-transform:uppercase; letter-spacing:0.16em; font-size:0.72rem; color:var(--muted); margin-bottom:8px; }
  .gateway-header h1 { margin:0; font-size:1.25rem; }
  .gateway-header p { margin:8px 0 0; color:var(--muted); max-width:780px; }
  .gateway-refresh { border:1px solid var(--line-strong, #d4d4d8); background:#fff; border-radius:999px; padding:0.8rem 1.2rem; font:inherit; }
  .surface-error, .surface-notice { margin:0; }
  .surface-error { color:#b74b4b; }
  .surface-notice { color:#99620d; }
  .gateway-story { display:flex; align-items:stretch; gap:12px; overflow:auto; padding-bottom:4px; }
  .story-node { min-width:190px; border-radius:24px; padding:1rem 1.1rem; border:1px solid var(--line, #e4e4e7); background:#fff; display:grid; gap:6px; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .story-node span { font-size:0.76rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); }
  .story-node strong { font-size:1.15rem; text-transform:capitalize; }
  .story-node p { margin:0; color:var(--muted); }
  .story-node.ready { background:linear-gradient(135deg, #f2fbf4, #fff); }
  .story-node.degraded { background:linear-gradient(135deg, #fff3f1, #fff); }
  .story-link { display:grid; place-items:center; color:var(--brand, #f26522); font-size:1.2rem; }
  .gateway-grid { display:grid; grid-template-columns: minmax(0, 1.35fr) minmax(340px, 0.9fr); gap:20px; }
  .surface-panel { background:#fff; border:1px solid var(--line, #e4e4e7); border-radius:30px; padding:1.25rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .panel-head { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:1rem; }
  .panel-head h2 { margin:0; font-size:1.2rem; }
  .chip { border:1px solid var(--line-strong, #d4d4d8); border-radius:999px; padding:0.3rem 0.7rem; font-size:0.8rem; background:var(--bg-soft, #f4f4f5); color:var(--muted); }
  .metric-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; margin-bottom:16px; }
  .metric-card { border:1px solid var(--line, #e4e4e7); border-radius:22px; padding:1rem; background:var(--panel, #fff); }
  .metric-card span { display:block; text-transform:uppercase; letter-spacing:0.12em; font-size:0.72rem; color:var(--muted); margin-bottom:8px; }
  .metric-card strong { font-size:1.1rem; }
  .activity-columns { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; }
  .activity-column { border:1px solid var(--line, #e4e4e7); border-radius:22px; padding:1rem; background:#fffdf9; }
  .activity-column h3 { margin:0 0 0.9rem; font-size:1rem; }
  .activity-card { border:1px solid #f1e7de; border-radius:18px; padding:0.9rem; background:#fff; display:grid; gap:4px; margin-bottom:10px; }
  .activity-card:last-child { margin-bottom:0; }
  .activity-card span { color:var(--muted); }
  .editor { width:100%; min-height:220px; border:1px solid var(--line, #e4e4e7); border-radius:20px; padding:1rem; font:inherit; background:var(--panel, #fff); resize:vertical; }
  .actions { display:flex; gap:10px; margin:1rem 0; }
  .action-btn { border:1px solid var(--line-strong, #d4d4d8); background:#fff; border-radius:999px; padding:0.7rem 1.1rem; font:inherit; }
  .action-btn.primary { background:var(--brand, #f26522); color:#fff; border-color:var(--brand, #f26522); }
  .preview-panel pre { margin:0; max-height:380px; overflow:auto; background:#1f1914; color:#f9f3ec; border-radius:20px; padding:1rem; font-size:0.82rem; }
  .empty-row { margin:0; color:var(--muted); }
  @media (max-width: 1080px) {
    .gateway-grid { grid-template-columns:1fr; }
    .activity-columns, .metric-grid { grid-template-columns:1fr; }
  }
</style>
