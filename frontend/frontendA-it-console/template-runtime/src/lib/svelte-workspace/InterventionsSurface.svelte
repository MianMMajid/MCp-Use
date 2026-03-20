<script>
  import { onMount } from 'svelte'

  import { loadJson, loadMany, sendJson, pickItems } from '../api/maple-api.js'
  import { mutationLaneLabel, mutationStatusLabel } from '../maple-workspace/cyber-view-model.js'
  import { humanizeError } from '../utils/error-display.js'

  const REQUESTS = Object.freeze([
    ['filesystemStatus', '/api/firewall/filesystem/status'],
    ['filesystemMutations', '/api/firewall/filesystem/mutations?limit=100'],
  ])

  let loading = true
  let error = ''
  let notice = ''
  let busy = ''
  let state = {}
  let selectedPlanId = ''
  let selectedPlan = null

  $: plans = pickItems(state.filesystemMutations?.value)
  $: if (!selectedPlanId && plans.length > 0) {
    selectedPlanId = plans[0].planId
  }
  $: groupedPlans = {
    pending: plans.filter((item) => ['pending', 'requested'].includes(String(item.status ?? '').toLowerCase())),
    review: plans.filter((item) => ['fork_required', 'approval_required', 'approved', 'direct_ready'].includes(String(item.lane ?? item.status ?? '').toLowerCase()) || ['approved', 'direct_ready'].includes(String(item.status ?? '').toLowerCase())),
    promoted: plans.filter((item) => ['promoted', 'restored'].includes(String(item.status ?? '').toLowerCase())),
  }

  async function refresh() {
    loading = true
    error = ''
    try {
      state = await loadMany(fetch, REQUESTS)
      if (selectedPlanId) await loadPlan(selectedPlanId)
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      loading = false
    }
  }

  async function loadPlan(planId) {
    if (!planId) return
    try {
      const detail = await loadJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(planId)}`)
      selectedPlan = detail?.item ?? null
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
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

  async function handleDecision(item, action) {
    const reason = window.prompt(`${action} reason`, action === 'approve' ? 'Reviewed mutation bundle' : 'Unsafe mutation')
    if (reason == null) return
    await runAction(`${item.planId}:${action}`, () =>
      sendJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(item.planId)}/decision`, { action, reason }),
    )
  }

  async function handlePromote(item) {
    const reason = window.prompt('Promotion note', 'Promote reviewed mutation bundle')
    if (reason == null) return
    await runAction(`${item.planId}:promote`, () =>
      sendJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(item.planId)}/promote`, { reason }),
    )
  }

  async function handleRestore(item) {
    const reason = window.prompt('Restore note', 'Restore archived content')
    if (reason == null) return
    await runAction(`${item.planId}:restore`, () =>
      sendJson(fetch, `/api/firewall/filesystem/mutations/${encodeURIComponent(item.planId)}/restore`, { reason }),
    )
  }

  function selectPlan(item) {
    selectedPlanId = item.planId
    loadPlan(item.planId)
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

<section class="interventions-page">
  <header class="surface-header">
    <div>
      <span class="surface-kicker">Firewalls</span>
      <h1>Filesystem Interventions</h1>
      <p>Review mutation plans through a lifecycle board, then approve, promote, or restore from the same operational surface.</p>
    </div>
    <button type="button" class="surface-refresh" on:click={refresh} disabled={loading}>Refresh</button>
  </header>

  {#if error}<p class="surface-error">{humanizeError(error)}</p>{/if}
  {#if notice}<p class="surface-notice">{notice}</p>{/if}

  <section class="status-strip">
    <article class="status-card">
      <span>Guard mode</span>
      <strong>{state.filesystemStatus?.value?.guard?.mode ?? '--'}</strong>
    </article>
    <article class="status-card">
      <span>Available</span>
      <strong>{state.filesystemStatus?.value?.guard?.available === false ? 'degraded' : 'ready'}</strong>
    </article>
    <article class="status-card">
      <span>Queued plans</span>
      <strong>{plans.length}</strong>
    </article>
  </section>

  <section class="board-grid">
    <div class="board-columns">
      {#each [
        ['Incoming', groupedPlans.pending],
        ['Review path', groupedPlans.review],
        ['Promoted / restored', groupedPlans.promoted],
      ] as [label, items]}
        <article class="lane-column">
          <div class="lane-head">
            <h2>{label}</h2>
            <span class="chip">{items.length}</span>
          </div>
          {#if items.length === 0}
            <p class="empty-row">No plans in this lane.</p>
          {:else}
            {#each items as item}
              <button type="button" class="plan-card" class:active={item.planId === selectedPlanId} on:click={() => selectPlan(item)}>
                <strong>{item.taskText || item.planId}</strong>
                <span>{mutationLaneLabel(item)} · {mutationStatusLabel(item)}</span>
              </button>
            {/each}
          {/if}
        </article>
      {/each}
    </div>

    <article class="detail-panel">
      <div class="panel-head">
        <h2>Selected plan</h2>
        <span class="chip">{selectedPlan?.planId ?? '--'}</span>
      </div>
      {#if !selectedPlan}
        <p class="empty-row">Select a plan to inspect its lifecycle and operator actions.</p>
      {:else}
        <div class="detail-cards">
          <article class="detail-card">
            <span>Lane</span>
            <strong>{mutationLaneLabel(selectedPlan)}</strong>
          </article>
          <article class="detail-card">
            <span>Status</span>
            <strong>{mutationStatusLabel(selectedPlan)}</strong>
          </article>
          <article class="detail-card">
            <span>Trace</span>
            <strong>{selectedPlan.traceId ?? '--'}</strong>
          </article>
          <article class="detail-card">
            <span>Session</span>
            <strong>{selectedPlan.sessionId ?? '--'}</strong>
          </article>
        </div>
        <div class="actions">
          <button type="button" class="action-btn" disabled={Boolean(busy)} on:click={() => handleDecision(selectedPlan, 'approve')}>Approve</button>
          <button type="button" class="action-btn danger" disabled={Boolean(busy)} on:click={() => handleDecision(selectedPlan, 'deny')}>Deny</button>
          <button type="button" class="action-btn primary" disabled={Boolean(busy) || !['approved', 'direct_ready'].includes(String(selectedPlan.status))} on:click={() => handlePromote(selectedPlan)}>Promote</button>
          <button type="button" class="action-btn" disabled={Boolean(busy) || selectedPlan.status !== 'promoted'} on:click={() => handleRestore(selectedPlan)}>Restore</button>
        </div>
        <pre>{JSON.stringify(selectedPlan, null, 2)}</pre>
      {/if}
    </article>
  </section>
</section>

<style>
  .interventions-page { display:grid; gap:var(--space-4, 16px); }
  .surface-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
  .surface-kicker { display:block; text-transform:uppercase; letter-spacing:0.16em; font-size:0.72rem; color:var(--muted); margin-bottom:8px; }
  .surface-header h1 { margin:0; font-size:1.25rem; }
  .surface-header p { margin:8px 0 0; color:var(--muted); max-width:760px; }
  .surface-refresh { border:1px solid var(--line-strong, #d4d4d8); background:#fff; border-radius:999px; padding:0.8rem 1.2rem; font:inherit; }
  .surface-error,.surface-notice { margin:0; }
  .surface-error { color:#b74b4b; }
  .surface-notice { color:#99620d; }
  .status-strip { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:12px; }
  .status-card { border:1px solid var(--line, #e4e4e7); border-radius:24px; background:#fff; padding:1rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .status-card span { display:block; text-transform:uppercase; letter-spacing:0.12em; font-size:0.72rem; color:var(--muted); margin-bottom:8px; }
  .status-card strong { font-size:1.1rem; }
  .board-grid { display:grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.9fr); gap:20px; }
  .board-columns { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:12px; }
  .lane-column, .detail-panel { background:#fff; border:1px solid var(--line, #e4e4e7); border-radius:28px; padding:1rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .lane-head, .panel-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:0.9rem; }
  .lane-head h2, .panel-head h2 { margin:0; font-size:1.05rem; }
  .chip { border:1px solid var(--line-strong, #d4d4d8); border-radius:999px; padding:0.3rem 0.7rem; font-size:0.8rem; background:var(--bg-soft, #f4f4f5); color:var(--muted); }
  .plan-card { width:100%; text-align:left; border:1px solid var(--line, #e4e4e7); background:var(--panel, #fff); border-radius:20px; padding:0.95rem; display:grid; gap:6px; font:inherit; margin-bottom:10px; }
  .plan-card:last-child { margin-bottom:0; }
  .plan-card.active { border-color:var(--brand, #f26522); box-shadow:0 0 0 3px rgba(239,159,56,0.16); background:rgba(242, 101, 34, 0.12); }
  .plan-card span { color:var(--muted); }
  .detail-cards { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; margin-bottom:12px; }
  .detail-card { border:1px solid var(--line, #e4e4e7); border-radius:20px; padding:0.95rem; background:var(--panel, #fff); }
  .detail-card span { display:block; text-transform:uppercase; letter-spacing:0.12em; font-size:0.72rem; color:var(--muted); margin-bottom:6px; }
  .actions { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px; }
  .action-btn { border:1px solid var(--line-strong, #d4d4d8); background:#fff; border-radius:999px; padding:0.7rem 1.1rem; font:inherit; }
  .action-btn.primary { background:var(--brand, #f26522); color:#fff; border-color:var(--brand, #f26522); }
  .action-btn.danger { background:#fff0ef; color:#9f443a; border-color:#f1cec9; }
  .detail-panel pre { margin:0; max-height:420px; overflow:auto; background:#1f1914; color:#f9f3ec; border-radius:20px; padding:1rem; font-size:0.82rem; }
  .empty-row { margin:0; color:var(--muted); }
  @media (max-width: 1180px) {
    .board-grid, .board-columns, .status-strip, .detail-cards { grid-template-columns:1fr; }
  }
</style>
