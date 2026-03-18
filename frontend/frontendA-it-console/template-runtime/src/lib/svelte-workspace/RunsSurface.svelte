<script>
  import { onMount } from 'svelte'

  import { loadMany, pickItems } from '../api/maple-api.js'
  import { humanizeError } from '../utils/error-display.js'

  const REQUESTS = Object.freeze([
    ['runs', '/api/runs'],
    ['agentSessions', '/api/openclaw/agent/sessions'],
  ])

  let loading = true
  let error = ''
  let state = {}
  let selectedRunId = ''

  $: runInventory = pickItems(state.runs?.value, ['runs', 'items'])
  $: sessions = pickItems(state.agentSessions?.value, ['sessions', 'items'])
  $: if (!selectedRunId && runInventory.length > 0) {
    selectedRunId = runInventory[0].runId ?? runInventory[0].id ?? ''
  }
  $: selectedRun = runInventory.find((item) => (item.runId ?? item.id) === selectedRunId) ?? null
  $: relatedSession = sessions.find((item) => (item.sessionId ?? item.id) === (selectedRun?.sessionId ?? selectedRun?.executionId)) ?? null
  $: lineageNodes = selectedRun
    ? [
        { label: 'Session', value: selectedRun.sessionId ?? selectedRun.executionId ?? '--', tone: 'zinc' },
        { label: 'Run', value: selectedRun.runId ?? selectedRun.id ?? '--', tone: 'orange' },
        { label: 'Status', value: selectedRun.status ?? selectedRun.state ?? 'unknown', tone: statusTone(selectedRun.status ?? selectedRun.state) },
        { label: 'Updated', value: formatDate(selectedRun.updatedAt ?? selectedRun.completedAt ?? selectedRun.createdAt), tone: 'zinc' },
      ]
    : []

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

  function formatDate(value) {
    if (!value) return '--'
    try {
      return new Date(value).toLocaleString()
    } catch {
      return String(value)
    }
  }

  function statusTone(status) {
    const value = String(status ?? '').toLowerCase()
    if (value.includes('fail') || value.includes('block') || value.includes('deny')) return 'rose'
    if (value.includes('progress') || value.includes('running') || value.includes('pending')) return 'amber'
    if (value.includes('done') || value.includes('complete') || value.includes('success')) return 'emerald'
    return 'zinc'
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

<section class="surface-page">
  <header class="surface-header">
    <div>
      <span class="surface-kicker">Monitor</span>
      <h1>Runs</h1>
      <p>Trace governed execution history through a run-native lineage view instead of a generic inventory dump.</p>
    </div>
    <button type="button" class="surface-refresh" on:click={refresh} disabled={loading}>Refresh</button>
  </header>

  {#if error}
    <p class="surface-error">{humanizeError(error)}</p>
  {/if}

  <section class="lineage-strip">
    {#if lineageNodes.length === 0}
      <article class="lineage-card lineage-empty">
        <strong>No governed runs yet</strong>
        <span>Runs appear here after live agent execution.</span>
      </article>
    {:else}
      {#each lineageNodes as node, index}
        <article class={`lineage-card tone-${node.tone}`}>
          <span>{node.label}</span>
          <strong>{node.value}</strong>
        </article>
        {#if index < lineageNodes.length - 1}
          <div class="lineage-link">→</div>
        {/if}
      {/each}
    {/if}
  </section>

  <section class="runs-grid">
    <article class="surface-panel">
      <div class="panel-head">
        <h2>Run inventory</h2>
        <span class="chip">{runInventory.length}</span>
      </div>
      <div class="run-list">
        {#if runInventory.length === 0}
          <p class="empty-row">No runs recorded yet.</p>
        {:else}
          {#each runInventory as run}
            <button
              type="button"
              class="run-card"
              class:active={(run.runId ?? run.id) === selectedRunId}
              on:click={() => { selectedRunId = run.runId ?? run.id ?? '' }}
            >
              <strong>{run.runId ?? run.id ?? '--'}</strong>
              <span>{run.sessionId ?? run.executionId ?? '--'}</span>
              <em>{run.status ?? run.state ?? 'unknown'}</em>
            </button>
          {/each}
        {/if}
      </div>
    </article>

    <article class="surface-panel">
      <div class="panel-head">
        <h2>Selected run story</h2>
        <span class="chip">{selectedRun ? 'live detail' : 'awaiting selection'}</span>
      </div>
      {#if !selectedRun}
        <p class="empty-row">Select a run to inspect its correlated session and timestamps.</p>
      {:else}
        <div class="detail-grid">
          <article class="detail-card">
            <span>Run ID</span>
            <strong>{selectedRun.runId ?? selectedRun.id ?? '--'}</strong>
          </article>
          <article class="detail-card">
            <span>Session</span>
            <strong>{selectedRun.sessionId ?? selectedRun.executionId ?? '--'}</strong>
          </article>
          <article class="detail-card">
            <span>Status</span>
            <strong>{selectedRun.status ?? selectedRun.state ?? '--'}</strong>
          </article>
          <article class="detail-card">
            <span>Updated</span>
            <strong>{formatDate(selectedRun.updatedAt ?? selectedRun.completedAt ?? selectedRun.createdAt)}</strong>
          </article>
        </div>

        <div class="detail-stack">
          <article class="detail-panel">
            <span class="detail-label">Related session</span>
            <strong>{relatedSession?.sessionId ?? relatedSession?.id ?? selectedRun.sessionId ?? '--'}</strong>
            <p>{relatedSession?.status ?? 'No richer session detail loaded for this run.'}</p>
          </article>
          <article class="detail-panel">
            <span class="detail-label">Raw correlation</span>
            <pre>{JSON.stringify({ run: selectedRun, session: relatedSession ?? null }, null, 2)}</pre>
          </article>
        </div>
      {/if}
    </article>
  </section>
</section>

<style>
  .surface-page { display: grid; gap: 24px; }
  .surface-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
  .surface-kicker { display:block; text-transform:uppercase; letter-spacing:0.16em; font-size:0.72rem; color:var(--muted,#7a6f67); margin-bottom:8px; }
  .surface-header h1 { margin:0; font-size:2rem; }
  .surface-header p { margin:8px 0 0; max-width:760px; color:var(--muted,#6f6b67); }
  .surface-refresh { border:1px solid var(--line,#e4d8cd); background:#fff; border-radius:999px; padding:0.8rem 1.2rem; font:inherit; }
  .surface-error { margin:0; color:var(--warn,#b74b4b); }
  .lineage-strip { display:flex; align-items:center; gap:12px; overflow:auto; padding-bottom:4px; }
  .lineage-card { min-width:180px; padding:1rem 1.1rem; border-radius:22px; background:#fff; border:1px solid var(--line,#eadfd5); display:grid; gap:8px; box-shadow:0 20px 40px rgba(113,79,45,0.07); }
  .lineage-card span { font-size:0.76rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted,#7a6f67); }
  .lineage-card strong { font-size:1rem; line-height:1.3; }
  .lineage-link { color:#d28b3f; font-size:1.2rem; }
  .tone-orange { background:linear-gradient(135deg, #fff8ec, #fff); }
  .tone-amber { background:linear-gradient(135deg, #fff5df, #fff); }
  .tone-emerald { background:linear-gradient(135deg, #eefaf2, #fff); }
  .tone-rose { background:linear-gradient(135deg, #fff0f1, #fff); }
  .runs-grid { display:grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap:20px; }
  .surface-panel { background:#fff; border:1px solid var(--line,#eadfd5); border-radius:28px; padding:1.25rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .panel-head { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:1rem; }
  .panel-head h2 { margin:0; font-size:1.2rem; }
  .chip { border:1px solid var(--line,#e4d8cd); border-radius:999px; padding:0.3rem 0.7rem; font-size:0.8rem; background:#fffaf5; color:#7a6f67; }
  .run-list { display:grid; gap:10px; }
  .run-card { text-align:left; border:1px solid var(--line,#eadfd5); background:#fffaf7; border-radius:22px; padding:1rem; display:grid; gap:6px; font:inherit; }
  .run-card.active { border-color:#ef9f38; box-shadow:0 0 0 3px rgba(239,159,56,0.16); background:#fff4e8; }
  .run-card span, .run-card em { color:var(--muted,#6f6b67); }
  .empty-row { margin:0; color:var(--muted,#6f6b67); }
  .detail-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; margin-bottom:16px; }
  .detail-card, .detail-panel { border:1px solid var(--line,#eadfd5); border-radius:22px; padding:1rem; background:#fffaf7; }
  .detail-card span, .detail-label { display:block; text-transform:uppercase; letter-spacing:0.12em; font-size:0.72rem; color:#8a7b70; margin-bottom:8px; }
  .detail-card strong, .detail-panel strong { font-size:1rem; }
  .detail-stack { display:grid; gap:12px; }
  .detail-panel p { margin:0.5rem 0 0; color:var(--muted,#6f6b67); }
  .detail-panel pre { margin:0.8rem 0 0; max-height:260px; overflow:auto; background:#1f1914; color:#f9f3ec; border-radius:18px; padding:1rem; font-size:0.82rem; }
  @media (max-width: 980px) {
    .runs-grid { grid-template-columns:1fr; }
    .detail-grid { grid-template-columns:1fr; }
  }
</style>
