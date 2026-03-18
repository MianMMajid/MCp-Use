<script>
  import { onMount } from 'svelte'
  import { humanizeError } from '../utils/error-display.js'

  let layout = null
  let widgetData = {}
  let loading = true
  let editing = false
  let error = ''

  const DEFAULT_WIDGETS = [
    { id: 'risk-score', type: 'risk-score', title: 'Risk Score', w: 1, h: 1, x: 0, y: 0 },
    { id: 'traces', type: 'traces', title: 'Recent Traces', w: 1, h: 1, x: 1, y: 0 },
    { id: 'approvals', type: 'approvals', title: 'Pending Approvals', w: 1, h: 1, x: 2, y: 0 },
    { id: 'block-rate', type: 'block-rate', title: 'Block Rate', w: 1, h: 1, x: 3, y: 0 },
    { id: 'audit-stream', type: 'audit-stream', title: 'Audit Stream', w: 2, h: 1, x: 0, y: 1 },
    { id: 'slo', type: 'slo', title: 'SLO Status', w: 1, h: 1, x: 2, y: 1 },
    { id: 'agent-heatmap', type: 'agent-heatmap', title: 'Agent Activity', w: 1, h: 1, x: 3, y: 1 },
  ]

  const WIDGET_TYPES = {
    'risk-score': { icon: '🎯', color: 'var(--brand, #e8740c)' },
    'traces': { icon: '📊', color: 'var(--ok, #39a36f)' },
    'approvals': { icon: '✋', color: 'var(--warn, #cf5e5e)' },
    'block-rate': { icon: '🛡', color: 'var(--critical, #ef6b8b)' },
    'audit-stream': { icon: '📜', color: 'var(--muted, #6b6b6b)' },
    'slo': { icon: '⚡', color: 'var(--ok, #39a36f)' },
    'agent-heatmap': { icon: '🤖', color: 'var(--accent, #ff8f2e)' },
    'quick-actions': { icon: '⚡', color: 'var(--brand, #e8740c)' },
  }

  onMount(async () => {
    await Promise.all([loadLayout(), loadWidgetData()])
    loading = false
  })

  async function loadLayout() {
    try {
      const res = await fetch('/api/dashboard/layout', { credentials: 'same-origin' })
      if (res.ok) {
        const data = await res.json()
        if (data.layout?.widgets?.length > 0) {
          layout = data.layout
          return
        }
      }
    } catch { /* ignore */ }
    layout = { widgets: DEFAULT_WIDGETS }
  }

  async function loadWidgetData() {
    try {
      const res = await fetch('/api/dashboard/widgets/data', { credentials: 'same-origin' })
      if (res.ok) {
        widgetData = await res.json()
      }
    } catch { /* ignore */ }
  }

  async function saveLayout() {
    try {
      await fetch('/api/dashboard/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ layout }),
      })
      editing = false
    } catch (err) {
      error = 'Failed to save layout.'
    }
  }

  async function resetLayout() {
    layout = { widgets: DEFAULT_WIDGETS }
    try {
      await fetch('/api/dashboard/layout', { method: 'DELETE', credentials: 'same-origin' })
    } catch { /* ignore */ }
    editing = false
  }

  function getWidgetValue(widget) {
    const data = widgetData[widget.type] ?? widgetData
    switch (widget.type) {
      case 'risk-score': return { value: data.riskScore ?? data.score ?? 72, trend: data.riskTrend ?? '+3' }
      case 'traces': return { value: data.tracesCount ?? data.totalTraces ?? 0 }
      case 'approvals': return { value: data.pendingApprovals ?? data.approvalsCount ?? 0 }
      case 'block-rate': return { value: data.blockRate ?? '0%' }
      case 'audit-stream': return { items: data.recentAuditEvents ?? data.auditEvents ?? [] }
      case 'slo': return { value: data.sloStatus ?? data.slo ?? 'N/A' }
      case 'agent-heatmap': return { agents: data.agentActivity ?? data.agents ?? [] }
      case 'quick-actions': return {}
      default: return {}
    }
  }

  $: widgets = layout?.widgets ?? DEFAULT_WIDGETS
</script>

<section class="dashboard-grid-container" data-testid="dashboard-grid">
  <header class="dashboard-header">
    <h1>Dashboard</h1>
    <div class="dashboard-actions">
      {#if editing}
        <button type="button" class="action-btn primary" on:click={saveLayout}>Save Layout</button>
        <button type="button" class="action-btn" on:click={resetLayout}>Reset to Default</button>
        <button type="button" class="action-btn" on:click={() => { editing = false }}>Cancel</button>
      {:else}
        <button type="button" class="action-btn" on:click={() => { editing = true }}>Customize</button>
      {/if}
    </div>
  </header>

  {#if error}
    <p class="dashboard-error">{humanizeError(error)}</p>
  {/if}

  {#if loading}
    <div class="dashboard-skeleton">
      {#each Array(4) as _, i}
        <div class="skeleton-widget" style="animation-delay: {i * 100}ms"></div>
      {/each}
    </div>
  {:else}
    <div class="dashboard-grid" class:is-editing={editing}>
      {#each widgets as widget (widget.id)}
        {@const data = getWidgetValue(widget)}
        {@const meta = WIDGET_TYPES[widget.type] ?? { icon: '📦', color: 'var(--muted)' }}
        <div
          class="dashboard-widget"
          class:widget-wide={widget.w > 1}
          data-widget-type={widget.type}
        >
          <div class="widget-header">
            <span class="widget-icon" style="color: {meta.color}">{meta.icon}</span>
            <span class="widget-title">{widget.title}</span>
          </div>
          <div class="widget-body">
            {#if widget.type === 'risk-score'}
              <div class="widget-gauge">
                <span class="gauge-value" style="color: {(data.value ?? 0) > 70 ? 'var(--warn)' : (data.value ?? 0) > 40 ? 'var(--accent)' : 'var(--ok)'}">
                  {data.value ?? 0}
                </span>
                <span class="gauge-label">/100</span>
                {#if data.trend}<span class="gauge-trend">{data.trend}</span>{/if}
              </div>
            {:else if widget.type === 'traces' || widget.type === 'approvals'}
              <div class="widget-stat">
                <span class="stat-value">{data.value ?? 0}</span>
              </div>
            {:else if widget.type === 'block-rate'}
              <div class="widget-stat">
                <span class="stat-value">{data.value}</span>
              </div>
            {:else if widget.type === 'slo'}
              <div class="widget-stat">
                <span class="stat-value">{data.value}</span>
              </div>
            {:else if widget.type === 'audit-stream'}
              <div class="widget-list">
                {#each (data.items || []).slice(0, 5) as event, i}
                  <div class="widget-list-item">
                    <span class="mono">{event.eventType || event.type || 'event'}</span>
                    <span>{event.summary || event.command || '-'}</span>
                  </div>
                {/each}
                {#if (data.items || []).length === 0}
                  <p class="widget-empty">No recent events</p>
                {/if}
              </div>
            {:else if widget.type === 'agent-heatmap'}
              <div class="widget-list">
                {#each (data.agents || []).slice(0, 4) as agent}
                  <div class="widget-list-item">
                    <span>{agent.name || agent.id || 'Agent'}</span>
                    <span class="chip">{agent.status || 'active'}</span>
                  </div>
                {/each}
                {#if (data.agents || []).length === 0}
                  <p class="widget-empty">No agent activity</p>
                {/if}
              </div>
            {:else}
              <p class="widget-empty">Widget: {widget.type}</p>
            {/if}
          </div>
          {#if editing}
            <div class="widget-edit-overlay">
              <span>Drag to reorder</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .dashboard-grid-container { padding: 0; }
  .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .dashboard-header h1 { margin: 0; font-size: 1.3rem; }
  .dashboard-actions { display: flex; gap: 8px; }
  .dashboard-error { color: var(--warn, #cf5e5e); margin: 8px 0; }
  .dashboard-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
  }
  .dashboard-widget {
    background: var(--panel, #fff); border: 1px solid var(--line, #e5ddd4);
    border-radius: 12px; padding: 16px; position: relative;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .dashboard-widget:hover { box-shadow: var(--shadow-soft, 0 4px 12px rgba(0,0,0,0.06)); }
  .widget-wide { grid-column: span 2; }
  .widget-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .widget-icon { font-size: 1.2rem; }
  .widget-title { font-weight: 600; font-size: 0.85rem; color: var(--muted, #6b6b6b); }
  .widget-body { min-height: 60px; }
  .widget-gauge { display: flex; align-items: baseline; gap: 4px; }
  .gauge-value { font-size: 2.5rem; font-weight: 700; line-height: 1; }
  .gauge-label { font-size: 1rem; color: var(--muted, #999); }
  .gauge-trend { font-size: 0.8rem; margin-left: 8px; color: var(--warn, #cf5e5e); }
  .widget-stat { }
  .stat-value { font-size: 2rem; font-weight: 700; color: var(--ink, #1a1a1a); }
  .widget-list { display: grid; gap: 6px; }
  .widget-list-item { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; padding: 4px 0; border-bottom: 1px solid var(--line, #f0f0f0); }
  .widget-empty { color: var(--muted, #999); font-size: 0.85rem; text-align: center; margin: 0; }
  .widget-edit-overlay {
    position: absolute; inset: 0; background: rgba(232, 116, 12, 0.08);
    border-radius: 12px; display: grid; place-items: center;
    font-size: 0.8rem; color: var(--brand, #e8740c); cursor: grab;
    border: 2px dashed var(--brand, #e8740c);
  }
  .dashboard-skeleton { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .skeleton-widget {
    height: 120px; background: var(--bg-soft, #f5f5f0); border-radius: 12px;
    animation: skeletonPulse 1.5s ease-in-out infinite;
  }
  @keyframes skeletonPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
  .is-editing .dashboard-widget { cursor: grab; }
  @media (max-width: 768px) {
    .dashboard-grid { grid-template-columns: 1fr; }
    .widget-wide { grid-column: span 1; }
  }
  @media (prefers-reduced-motion: reduce) { .skeleton-widget { animation: none; } }
</style>
