<script>
  import { onMount } from 'svelte'

  import { loadMany, pickItems, sendJson } from '../api/maple-api.js'
  import { humanizeError } from '../utils/error-display.js'

  const REQUESTS = Object.freeze([
    ['modifierApprovals', '/api/operations/orchestrations/approvals'],
  ])

  let loading = true
  let error = ''
  let notice = ''
  let busy = ''
  let state = {}
  let selectedApprovalId = ''

  $: approvals = pickItems(state.modifierApprovals?.value)
  $: if (!selectedApprovalId && approvals.length > 0) {
    selectedApprovalId = approvals[0].approvalId ?? approvals[0].id ?? ''
  }
  $: selectedApproval = approvals.find((item) => (item.approvalId ?? item.id) === selectedApprovalId) ?? null

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

  async function handleDecision(approval, action) {
    const reason = window.prompt(`${action} reason`, action === 'approve' ? 'Modifier approved' : 'Modifier denied') ?? ''
    busy = `${approval.approvalId}:${action}`
    error = ''
    notice = ''
    try {
      await sendJson(fetch, `/api/operations/orchestrations/approvals/${encodeURIComponent(approval.approvalId)}/decision`, {
        action,
        ...(reason ? { reason } : {}),
      })
      notice = `${action} recorded for ${approval.approvalId}.`
      await refresh()
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }

  onMount(() => {
    refresh()
    const onShellRefresh = () => refresh()
    window.addEventListener('maple:shell-refresh', onShellRefresh)
    const intervalId = window.setInterval(refresh, 15000)
    return () => {
      window.removeEventListener('maple:shell-refresh', onShellRefresh)
      window.clearInterval(intervalId)
    }
  })
</script>

<section class="modifier-page">
  <header class="surface-header">
    <div>
      <span class="surface-kicker">Agents</span>
      <h1>Modifier Approvals</h1>
      <p>Review privileged modifier requests as structured change proposals instead of queue rows, with the selected request’s scope and rationale always visible.</p>
    </div>
    <button type="button" class="surface-refresh" on:click={refresh} disabled={loading}>Refresh</button>
  </header>

  {#if error}<p class="surface-error">{humanizeError(error)}</p>{/if}
  {#if notice}<p class="surface-notice">{notice}</p>{/if}

  <section class="modifier-grid">
    <article class="surface-panel">
      <div class="panel-head">
        <h2>Requests</h2>
        <span class="chip">{approvals.length}</span>
      </div>
      <div class="request-list">
        {#if approvals.length === 0}
          <p class="empty-row">No modifier approvals are pending.</p>
        {:else}
          {#each approvals as approval}
            <button type="button" class="request-card" class:active={(approval.approvalId ?? approval.id) === selectedApprovalId} on:click={() => { selectedApprovalId = approval.approvalId ?? approval.id ?? '' }}>
              <strong>{approval.approvalId ?? approval.title ?? 'modifier approval'}</strong>
              <span>{approval.summary ?? approval.reason ?? '--'}</span>
            </button>
          {/each}
        {/if}
      </div>
    </article>

    <article class="surface-panel">
      <div class="panel-head">
        <h2>Change impact</h2>
        <span class="chip">{selectedApproval ? 'selected' : 'awaiting selection'}</span>
      </div>
      {#if !selectedApproval}
        <p class="empty-row">Select a modifier request to review its scope.</p>
      {:else}
        <div class="impact-grid">
          <article class="impact-card">
            <span>Approval</span>
            <strong>{selectedApproval.approvalId ?? '--'}</strong>
          </article>
          <article class="impact-card">
            <span>Summary</span>
            <strong>{selectedApproval.summary ?? selectedApproval.reason ?? '--'}</strong>
          </article>
          <article class="impact-card">
            <span>Scope</span>
            <strong>{selectedApproval.scope ?? selectedApproval.resource ?? '--'}</strong>
          </article>
          <article class="impact-card">
            <span>Requester</span>
            <strong>{selectedApproval.requestedBy ?? selectedApproval.userId ?? '--'}</strong>
          </article>
        </div>
        <div class="actions">
          <button type="button" class="action-btn" on:click={() => handleDecision(selectedApproval, 'approve')} disabled={Boolean(busy)}>Approve</button>
          <button type="button" class="action-btn danger" on:click={() => handleDecision(selectedApproval, 'deny')} disabled={Boolean(busy)}>Deny</button>
        </div>
        <pre>{JSON.stringify(selectedApproval, null, 2)}</pre>
      {/if}
    </article>
  </section>
</section>

<style>
  .modifier-page { display:grid; gap:var(--space-4, 16px); }
  .surface-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
  .surface-kicker { display:block; text-transform:uppercase; letter-spacing:0.16em; font-size:0.72rem; color:var(--muted); margin-bottom:8px; }
  .surface-header h1 { margin:0; font-size:1.25rem; }
  .surface-header p { margin:8px 0 0; color:var(--muted); max-width:780px; }
  .surface-refresh { border:1px solid var(--line-strong, #d4d4d8); background:#fff; border-radius:999px; padding:0.8rem 1.2rem; font:inherit; }
  .surface-error,.surface-notice { margin:0; }
  .surface-error { color:#b74b4b; }
  .surface-notice { color:#99620d; }
  .modifier-grid { display:grid; grid-template-columns:minmax(320px, 0.8fr) minmax(0, 1.1fr); gap:20px; }
  .surface-panel { background:#fff; border:1px solid var(--line, #e4e4e7); border-radius:28px; padding:1rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .panel-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:1rem; }
  .panel-head h2 { margin:0; font-size:1.15rem; }
  .chip { border:1px solid var(--line-strong, #d4d4d8); border-radius:999px; padding:0.3rem 0.7rem; font-size:0.8rem; background:var(--bg-soft, #f4f4f5); color:var(--muted); }
  .request-list { display:grid; gap:10px; }
  .request-card { text-align:left; border:1px solid var(--line, #e4e4e7); background:var(--panel, #fff); border-radius:20px; padding:0.95rem; display:grid; gap:6px; font:inherit; }
  .request-card.active { border-color:var(--brand, #f26522); box-shadow:0 0 0 3px rgba(239,159,56,0.16); background:rgba(242, 101, 34, 0.12); }
  .request-card span { color:var(--muted); }
  .impact-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; margin-bottom:12px; }
  .impact-card { border:1px solid var(--line, #e4e4e7); border-radius:20px; background:var(--panel, #fff); padding:0.95rem; }
  .impact-card span { display:block; text-transform:uppercase; letter-spacing:0.12em; font-size:0.72rem; color:var(--muted); margin-bottom:6px; }
  .actions { display:flex; gap:10px; margin-bottom:12px; }
  .action-btn { border:1px solid var(--line-strong, #d4d4d8); background:#fff; border-radius:999px; padding:0.65rem 1rem; font:inherit; }
  .action-btn.danger { background:#fff0ef; color:#9f443a; border-color:#f1cec9; }
  pre { margin:0; max-height:420px; overflow:auto; background:#1f1914; color:#f9f3ec; border-radius:20px; padding:1rem; font-size:0.82rem; }
  .empty-row { margin:0; color:var(--muted); }
  @media (max-width: 980px) {
    .modifier-grid, .impact-grid { grid-template-columns:1fr; }
  }
</style>
