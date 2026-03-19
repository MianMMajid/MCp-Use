<script>
  import { humanizeError } from '../utils/error-display.js'
  import { sendJson } from '../api/maple-api.js'

  const WORKFLOWS = Object.freeze([
    {
      id: 'start',
      title: 'Trace Start',
      summary: 'Start a governed path and seed the initial trace evidence.',
      destinations: ['Agent Management', 'Firewall Dashboard'],
    },
    {
      id: 'guard',
      title: 'Guard Path',
      summary: 'Exercise the guarded branch and highlight firewall intervention.',
      destinations: ['Policy Center', 'Agent Management'],
    },
    {
      id: 'full',
      title: 'Full Workflow',
      summary: 'Run the full governed path across trace, guard, and artifact evidence.',
      destinations: ['Firewall Dashboard', 'Policy Center', 'Agent Management'],
    },
  ])

  let busy = ''
  let error = ''
  let notice = ''
  let selectedWorkflowId = 'full'

  $: selectedWorkflow = WORKFLOWS.find((item) => item.id === selectedWorkflowId) ?? WORKFLOWS[0]

  async function runWorkflow(action) {
    busy = action
    error = ''
    notice = ''
    try {
      const endpoint = action === 'start' ? '/api/demo/start' : action === 'guard' ? '/api/demo/guard' : '/api/demo/full'
      const payload = await sendJson(fetch, endpoint, {})
      notice = payload?.message || `${action} workflow completed.`
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }
</script>

<section class="workflow-page">
  <header class="surface-header">
    <div>
      <span class="surface-kicker">Agents</span>
      <h1>Operational Scenarios</h1>
      <p>Use structured workflows to rehearse the governed product paths, then jump directly to the proof surfaces that confirm each outcome.</p>
    </div>
  </header>

  {#if error}<p class="surface-error">{humanizeError(error)}</p>{/if}
  {#if notice}<p class="surface-notice">{notice}</p>{/if}

  <section class="workflow-grid">
    <article class="surface-panel">
      <div class="panel-head">
        <h2>Workflow atlas</h2>
        <span class="chip">{WORKFLOWS.length}</span>
      </div>
      <div class="workflow-list">
        {#each WORKFLOWS as workflow}
          <button type="button" class="workflow-card" class:active={workflow.id === selectedWorkflowId} on:click={() => { selectedWorkflowId = workflow.id }}>
            <strong>{workflow.title}</strong>
            <span>{workflow.summary}</span>
          </button>
        {/each}
      </div>
    </article>

    <article class="surface-panel">
      <div class="panel-head">
        <h2>Selected workflow</h2>
        <span class="chip">{selectedWorkflow.title}</span>
      </div>
      <article class="workflow-detail">
        <strong>{selectedWorkflow.summary}</strong>
        <div class="destination-list">
          {#each selectedWorkflow.destinations as destination}
            <span>{destination}</span>
          {/each}
        </div>
      </article>
      <div class="actions">
        <button type="button" class="action-btn primary" on:click={() => runWorkflow(selectedWorkflow.id)} disabled={Boolean(busy)}>
          {busy === selectedWorkflow.id ? 'Running...' : 'Run workflow'}
        </button>
      </div>
    </article>
  </section>
</section>

<style>
  .workflow-page { display:grid; gap:var(--space-4, 16px); }
  .surface-header h1 { margin:0; font-size:1.25rem; }
  .surface-kicker { display:block; text-transform:uppercase; letter-spacing:0.16em; font-size:0.72rem; color:var(--muted); margin-bottom:8px; }
  .surface-header p { margin:8px 0 0; color:var(--muted); max-width:780px; }
  .surface-error,.surface-notice { margin:0; }
  .surface-error { color:#b74b4b; }
  .surface-notice { color:#99620d; }
  .workflow-grid { display:grid; grid-template-columns:minmax(320px, 0.8fr) minmax(0, 1fr); gap:20px; }
  .surface-panel { background:#fff; border:1px solid var(--line, #e4e4e7); border-radius:28px; padding:1rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .panel-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:1rem; }
  .panel-head h2 { margin:0; font-size:1.15rem; }
  .chip { border:1px solid var(--line-strong, #d4d4d8); border-radius:999px; padding:0.3rem 0.7rem; font-size:0.8rem; background:var(--bg-soft, #f4f4f5); color:var(--muted); }
  .workflow-list { display:grid; gap:10px; }
  .workflow-card { text-align:left; border:1px solid var(--line, #e4e4e7); background:var(--panel, #fff); border-radius:20px; padding:0.95rem; display:grid; gap:6px; font:inherit; }
  .workflow-card.active { border-color:var(--brand, #f26522); box-shadow:0 0 0 3px rgba(239,159,56,0.16); background:rgba(242, 101, 34, 0.12); }
  .workflow-card span { color:var(--muted); }
  .workflow-detail { border:1px solid var(--line, #e4e4e7); background:var(--panel, #fff); border-radius:20px; padding:1rem; display:grid; gap:12px; }
  .destination-list { display:flex; flex-wrap:wrap; gap:10px; }
  .destination-list span { border:1px solid var(--line, #e4e4e7); border-radius:999px; padding:0.45rem 0.9rem; background:#fff; font-size:0.84rem; }
  .actions { display:flex; gap:10px; margin-top:12px; }
  .action-btn { border:1px solid var(--line-strong, #d4d4d8); background:#fff; border-radius:999px; padding:0.7rem 1rem; font:inherit; }
  .action-btn.primary { background:var(--brand, #f26522); color:#fff; border-color:var(--brand, #f26522); }
  @media (max-width: 980px) {
    .workflow-grid { grid-template-columns:1fr; }
  }
</style>
