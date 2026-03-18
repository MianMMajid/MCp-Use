<script>
  import { onMount } from 'svelte'

  import { loadMany, pickItems, sendJson } from '../api/maple-api.js'
  import { humanizeError } from '../utils/error-display.js'

  const REQUESTS = Object.freeze([
    ['gatewayApprovals', '/api/hitl/approvals'],
    ['adminApprovals', '/admin/api/approvals'],
  ])

  let loading = true
  let error = ''
  let notice = ''
  let busy = ''
  let state = {}

  $: gatewayApprovals = pickItems(state.gatewayApprovals?.value)
  $: adminApprovals = pickItems(state.adminApprovals?.value)

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

  async function handleDecision(mode, approval, action) {
    const reason = window.prompt(`${action} reason`, action === 'approve' ? 'Reviewed by operator' : 'Rejected by operator') ?? ''
    busy = `${mode}:${action}`
    error = ''
    notice = ''
    try {
      const path = mode === 'admin' ? '/admin/api/approvals/decision' : '/api/hitl/approvals/decision'
      await sendJson(fetch, path, {
        traceId: approval.traceId,
        stepIndex: approval.stepIndex,
        action,
        ...(reason ? { reason } : {}),
      })
      notice = `${action} recorded for ${approval.traceId ?? approval.title ?? 'approval'}.`
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

<section class="approval-page">
  <header class="surface-header">
    <div>
      <span class="surface-kicker">Agents</span>
      <h1>HITL Queue</h1>
      <p>Use the approval surface as a gate map: what is paused, which trace it belongs to, and what resumes once approved.</p>
    </div>
    <button type="button" class="surface-refresh" on:click={refresh} disabled={loading}>Refresh</button>
  </header>

  {#if error}<p class="surface-error">{humanizeError(error)}</p>{/if}
  {#if notice}<p class="surface-notice">{notice}</p>{/if}

  <section class="approval-grid">
    {#each [
      ['Gateway approvals', 'gateway', gatewayApprovals],
      ['Admin approvals', 'admin', adminApprovals],
    ] as [label, mode, items]}
      <article class="surface-panel">
        <div class="panel-head">
          <h2>{label}</h2>
          <span class="chip">{items.length}</span>
        </div>
        {#if items.length === 0}
          <p class="empty-row">No pending approvals in this lane.</p>
        {:else}
          <div class="approval-list">
            {#each items as approval}
              <article class="approval-card">
                <div>
                  <strong>{approval.title ?? approval.traceId ?? 'approval'}</strong>
                  <span>step={approval.stepIndex ?? '--'} · session={approval.sessionId ?? '--'}</span>
                </div>
                <div class="actions">
                  <button type="button" class="action-btn" on:click={() => handleDecision(mode, approval, 'approve')} disabled={Boolean(busy)}>Approve</button>
                  <button type="button" class="action-btn danger" on:click={() => handleDecision(mode, approval, 'deny')} disabled={Boolean(busy)}>Deny</button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </section>
</section>

<style>
  .approval-page { display:grid; gap:24px; }
  .surface-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
  .surface-kicker { display:block; text-transform:uppercase; letter-spacing:0.16em; font-size:0.72rem; color:#7a6f67; margin-bottom:8px; }
  .surface-header h1 { margin:0; font-size:2rem; }
  .surface-header p { margin:8px 0 0; color:#6f6b67; max-width:780px; }
  .surface-refresh { border:1px solid #e4d8cd; background:#fff; border-radius:999px; padding:0.8rem 1.2rem; font:inherit; }
  .surface-error,.surface-notice { margin:0; }
  .surface-error { color:#b74b4b; }
  .surface-notice { color:#99620d; }
  .approval-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; }
  .surface-panel { background:#fff; border:1px solid #eadfd5; border-radius:28px; padding:1rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .panel-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:1rem; }
  .panel-head h2 { margin:0; font-size:1.15rem; }
  .chip { border:1px solid #e4d8cd; border-radius:999px; padding:0.3rem 0.7rem; font-size:0.8rem; background:#fffaf5; color:#7a6f67; }
  .approval-list { display:grid; gap:10px; }
  .approval-card { border:1px solid #eadfd5; background:#fffaf7; border-radius:20px; padding:1rem; display:grid; gap:10px; }
  .approval-card span { color:#6f6b67; }
  .actions { display:flex; gap:10px; }
  .action-btn { border:1px solid #e4d8cd; background:#fff; border-radius:999px; padding:0.65rem 1rem; font:inherit; }
  .action-btn.danger { background:#fff0ef; color:#9f443a; border-color:#f1cec9; }
  .empty-row { margin:0; color:#6f6b67; }
  @media (max-width: 980px) {
    .approval-grid { grid-template-columns:1fr; }
  }
</style>
