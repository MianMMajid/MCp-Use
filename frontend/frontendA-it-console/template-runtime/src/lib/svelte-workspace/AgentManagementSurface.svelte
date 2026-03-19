<script>
  import { onMount } from 'svelte'

  import { loadJson, loadMany, sendJson, pickItems } from '../api/maple-api.js'
  import { humanizeError } from '../utils/error-display.js'

  const REQUESTS = Object.freeze([
    ['agentStatus', '/api/openclaw/agent/status'],
    ['agentSessions', '/api/openclaw/agent/sessions'],
  ])

  let loading = true
  let error = ''
  let notice = ''
  let busy = ''
  let state = {}
  let selectedSessionId = ''
  let selectedAgentDetail = null
  let selectedArtifacts = []
  let selectedArtifactsRunId = ''
  let agentMode = 'turn'
  let agentPrompt = ''
  let agentReply = null

  $: sessions = pickItems(state.agentSessions?.value, ['sessions', 'items'])
  $: if (!selectedSessionId && sessions.length > 0) {
    selectedSessionId = sessions[0].sessionId ?? sessions[0].id ?? ''
  }
  $: selectedSession = sessions.find((item) => (item.sessionId ?? item.id) === selectedSessionId) ?? null
  $: selectedRuns = Array.isArray(selectedAgentDetail?.session?.runs)
    ? selectedAgentDetail.session.runs
    : (Array.isArray(selectedAgentDetail?.runs) ? selectedAgentDetail.runs : [])

  async function refresh() {
    loading = true
    error = ''
    try {
      state = await loadMany(fetch, REQUESTS)
      if (selectedSessionId) await loadSession(selectedSessionId)
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      loading = false
    }
  }

  async function loadSession(sessionId) {
    if (!sessionId) return
    try {
      selectedAgentDetail = await loadJson(fetch, `/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}?include=runs`)
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
      selectedAgentDetail = null
    }
  }

  async function loadArtifacts(runId) {
    if (!runId) return
    busy = `artifacts:${runId}`
    error = ''
    try {
      const payload = await loadJson(fetch, `/api/openclaw/agent/runs/${encodeURIComponent(runId)}/artifacts`)
      const runPayload = payload?.run ?? payload ?? {}
      selectedArtifactsRunId = runPayload?.runId ?? runId
      selectedArtifacts = Array.isArray(runPayload?.artifacts) ? runPayload.artifacts : []
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }

  async function runAction(key, operation) {
    busy = key
    error = ''
    notice = ''
    try {
      await operation()
      await refresh()
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }

  async function handlePrompt() {
    if (!agentPrompt.trim()) return
    const endpoint = agentMode === 'longform' ? '/api/openclaw/agent/longform' : '/api/openclaw/agent/turn'
    const body = agentMode === 'longform' ? { objective: agentPrompt } : { message: agentPrompt }
    await runAction(`prompt:${agentMode}`, async () => {
      agentReply = await sendJson(fetch, endpoint, body)
      notice = `Agent ${agentMode} request completed.`
    })
  }

  async function handleCancel(sessionId) {
    if (!sessionId) return
    await runAction(`cancel:${sessionId}`, () =>
      sendJson(fetch, `/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}/cancel`, {}),
    )
  }

  function formatDate(value) {
    if (!value) return '--'
    try {
      return new Date(value).toLocaleString()
    } catch {
      return String(value)
    }
  }

  function selectSession(sessionId) {
    selectedSessionId = sessionId
    selectedArtifacts = []
    selectedArtifactsRunId = ''
    loadSession(sessionId)
  }

  onMount(() => {
    refresh()
    const onShellRefresh = () => refresh()
    window.addEventListener('maple:shell-refresh', onShellRefresh)
    const intervalId = window.setInterval(refresh, 20000)
    return () => {
      window.removeEventListener('maple:shell-refresh', onShellRefresh)
      window.clearInterval(intervalId)
    }
  })
</script>

<section class="agent-page">
  <header class="surface-header">
    <div>
      <span class="surface-kicker">Agents</span>
      <h1>Agent Management</h1>
      <p>Follow a governed execution from prompt to session to run artifacts, with prompt submission and evidence inspection on the same page.</p>
    </div>
    <button type="button" class="surface-refresh" on:click={refresh} disabled={loading}>Refresh</button>
  </header>

  {#if error}<p class="surface-error">{humanizeError(error)}</p>{/if}
  {#if notice}<p class="surface-notice">{notice}</p>{/if}

  <section class="prompt-bar">
    <div class="mode-tabs">
      <button type="button" class:active={agentMode === 'turn'} on:click={() => (agentMode = 'turn')}>Turn</button>
      <button type="button" class:active={agentMode === 'longform'} on:click={() => (agentMode = 'longform')}>Longform</button>
    </div>
    <textarea bind:value={agentPrompt} placeholder="Submit a governed agent request from Frontend A."></textarea>
    <button type="button" class="action-btn primary" on:click={handlePrompt} disabled={Boolean(busy) || !agentPrompt.trim()}>Send</button>
  </section>

  <section class="agent-grid">
    <article class="surface-panel session-panel">
      <div class="panel-head">
        <h2>Sessions</h2>
        <span class="chip">{sessions.length}</span>
      </div>
      <div class="session-list">
        {#if sessions.length === 0}
          <p class="empty-row">No active sessions yet.</p>
        {:else}
          {#each sessions as session}
            <button type="button" class="session-card" class:active={(session.sessionId ?? session.id) === selectedSessionId} on:click={() => selectSession(session.sessionId ?? session.id ?? '')}>
              <strong>{session.sessionId ?? session.id ?? '--'}</strong>
              <span>{session.status ?? 'unknown'} · {formatDate(session.updatedAt ?? session.createdAt)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </article>

    <article class="surface-panel execution-panel">
      <div class="panel-head">
        <h2>Execution chain</h2>
        <span class="chip">{selectedSession ? selectedSession.status ?? 'selected' : 'awaiting selection'}</span>
      </div>
      {#if !selectedSession}
        <p class="empty-row">Select a session to inspect governed execution.</p>
      {:else}
        <div class="chain-strip">
          {#each [
            ['Session', selectedSession.sessionId ?? selectedSession.id ?? '--'],
            ['Runs', selectedRuns.length],
            ['Artifacts', selectedArtifactsRunId ? selectedArtifacts.length : 0],
          ] as [label, value], index}
            <article class="chain-node">
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
            {#if index < 2}
              <div class="chain-link">→</div>
            {/if}
          {/each}
        </div>
        <div class="run-stack">
          {#if selectedRuns.length > 0}
            {#each selectedRuns as run}
              <article class="run-card">
                <div>
                  <strong>{run.runId ?? run.id ?? 'run'}</strong>
                  <span>{run.status ?? run.state ?? '--'}</span>
                </div>
                <button type="button" class="action-btn" on:click={() => loadArtifacts(run.runId ?? run.id)} disabled={Boolean(busy)}>Load artifacts</button>
              </article>
            {/each}
          {:else}
            <p class="empty-row">No runs recorded for this session.</p>
          {/if}
        </div>
      {/if}
    </article>

    <article class="surface-panel evidence-panel">
      <div class="panel-head">
        <h2>Evidence rail</h2>
        <span class="chip">{selectedArtifactsRunId || (agentReply ? 'last reply' : 'idle')}</span>
      </div>
      {#if selectedArtifactsRunId}
        <pre>{JSON.stringify({ runId: selectedArtifactsRunId, artifacts: selectedArtifacts }, null, 2)}</pre>
      {:else if agentReply}
        <pre>{JSON.stringify(agentReply, null, 2)}</pre>
      {:else if selectedAgentDetail}
        <pre>{JSON.stringify(selectedAgentDetail, null, 2)}</pre>
      {:else}
        <p class="empty-row">Run artifacts and session evidence render here.</p>
      {/if}
      {#if selectedSessionId}
        <button type="button" class="action-btn danger" on:click={() => handleCancel(selectedSessionId)} disabled={Boolean(busy)}>Cancel session</button>
      {/if}
    </article>
  </section>
</section>

<style>
  .agent-page { display:grid; gap:24px; }
  .surface-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
  .surface-kicker { display:block; text-transform:uppercase; letter-spacing:0.16em; font-size:0.72rem; color:#7a6f67; margin-bottom:8px; }
  .surface-header h1 { margin:0; font-size:2rem; }
  .surface-header p { margin:8px 0 0; color:#6f6b67; max-width:780px; }
  .surface-refresh { border:1px solid #e4d8cd; background:#fff; border-radius:999px; padding:0.8rem 1.2rem; font:inherit; }
  .surface-error,.surface-notice { margin:0; }
  .surface-error { color:#b74b4b; }
  .surface-notice { color:#99620d; }
  .prompt-bar { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:12px; align-items:start; background:#fff; border:1px solid #eadfd5; border-radius:28px; padding:1rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .mode-tabs { display:flex; gap:8px; }
  .mode-tabs button, .action-btn { border:1px solid #e4d8cd; background:#fff; border-radius:999px; padding:0.7rem 1rem; font:inherit; }
  .mode-tabs button.active { background:#fff4e8; border-color:#ef9f38; }
  .prompt-bar textarea { min-height:92px; border:1px solid #eadfd5; background:#fffaf7; border-radius:20px; padding:0.95rem; font:inherit; resize:vertical; }
  .action-btn.primary { background:#ef9f38; color:#fff; border-color:#ef9f38; }
  .action-btn.danger { background:#fff0ef; color:#9f443a; border-color:#f1cec9; }
  .agent-grid { display:grid; grid-template-columns: minmax(260px, 0.85fr) minmax(0, 1.1fr) minmax(320px, 0.95fr); gap:20px; }
  .surface-panel { background:#fff; border:1px solid #eadfd5; border-radius:28px; padding:1rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .panel-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:1rem; }
  .panel-head h2 { margin:0; font-size:1.15rem; }
  .chip { border:1px solid #e4d8cd; border-radius:999px; padding:0.3rem 0.7rem; font-size:0.8rem; background:#fffaf5; color:#7a6f67; }
  .session-list, .run-stack { display:grid; gap:10px; }
  .session-card, .run-card { border:1px solid #eadfd5; background:#fffaf7; border-radius:20px; padding:0.95rem; font:inherit; }
  .session-card { text-align:left; display:grid; gap:6px; }
  .session-card.active { border-color:#ef9f38; box-shadow:0 0 0 3px rgba(239,159,56,0.16); background:#fff4e8; }
  .session-card span, .run-card span { color:#6f6b67; }
  .chain-strip { display:flex; align-items:center; gap:12px; overflow:auto; padding-bottom:4px; margin-bottom:14px; }
  .chain-node { min-width:150px; border:1px solid #eadfd5; border-radius:20px; background:#fffaf7; padding:0.9rem; }
  .chain-node span { display:block; text-transform:uppercase; letter-spacing:0.12em; font-size:0.72rem; color:#8a7b70; margin-bottom:6px; }
  .chain-link { color:#d28b3f; font-size:1.2rem; }
  .run-card { display:flex; justify-content:space-between; gap:12px; align-items:center; }
  .evidence-panel pre { margin:0 0 12px; max-height:520px; overflow:auto; background:#1f1914; color:#f9f3ec; border-radius:20px; padding:1rem; font-size:0.82rem; }
  .empty-row { margin:0; color:#6f6b67; }
  @media (max-width: 1180px) {
    .agent-grid { grid-template-columns:1fr; }
    .prompt-bar { grid-template-columns:1fr; }
  }
</style>
