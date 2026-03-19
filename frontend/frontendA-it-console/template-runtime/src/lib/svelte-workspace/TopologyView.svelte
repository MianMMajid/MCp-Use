<script>
  import { onDestroy } from 'svelte'

  export let endpoints = []
  export let observedTargets = []
  export let queueInterventionHandoff = () => {}

  let topologyZoom = 0.78
  let topologyPanX = 0
  let topologyPanY = 0
  let topologyPanning = false
  let panDrag = null
  let selectedTargetId = ''

  function clampZoom(value) {
    return Math.max(0.45, Math.min(1.8, value))
  }

  function nudgeTopologyZoom(delta) {
    topologyZoom = clampZoom(topologyZoom + delta)
  }

  function onTopologyWheel(event) {
    event.preventDefault()
    nudgeTopologyZoom(event.deltaY > 0 ? -0.08 : 0.08)
  }

  function nonPassiveWheel(node, handler) {
    node.addEventListener('wheel', handler, { passive: false })
    return {
      update(nextHandler) {
        node.removeEventListener('wheel', handler, { passive: false })
        handler = nextHandler
        node.addEventListener('wheel', handler, { passive: false })
      },
      destroy() {
        node.removeEventListener('wheel', handler, { passive: false })
      },
    }
  }

  function startPan(event) {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.canvas-zoom-controls, .topology-target-node')) return
    event.preventDefault()
    panDrag = {
      x: event.clientX,
      y: event.clientY,
      startX: topologyPanX,
      startY: topologyPanY,
    }
    topologyPanning = true
    window.addEventListener('mousemove', onPanMove)
    window.addEventListener('mouseup', endPan)
  }

  function onPanMove(event) {
    if (!panDrag) return
    topologyPanX = panDrag.startX + (event.clientX - panDrag.x)
    topologyPanY = panDrag.startY + (event.clientY - panDrag.y)
  }

  function endPan() {
    panDrag = null
    topologyPanning = false
    window.removeEventListener('mousemove', onPanMove)
    window.removeEventListener('mouseup', endPan)
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', onPanMove)
      window.removeEventListener('mouseup', endPan)
    }
  })

  function compactPath(value) {
    if (!value) return '/'
    return String(value).length > 46 ? `${String(value).slice(0, 43)}...` : String(value)
  }

  function compactTitle(value) {
    if (!value) return ''
    return String(value).length > 72 ? `${String(value).slice(0, 69)}...` : String(value)
  }

  function toneForTarget(target) {
    if (target?.blocked) return 'blocked'
    if (String(target?.verdict ?? '').toLowerCase() === 'malicious') return 'blocked'
    if (String(target?.verdict ?? '').toLowerCase() === 'safe') return 'observed'
    return 'pending'
  }

  function buildFallbackTargets() {
    const items = Array.isArray(endpoints) ? endpoints : []
    return items.slice(0, 8).map((endpoint, index) => ({
      id: endpoint.id ?? `fallback-${index + 1}`,
      label: endpoint.host ?? endpoint.name ?? `endpoint-${index + 1}`,
      host: endpoint.host ?? endpoint.name ?? `endpoint-${index + 1}`,
      path: endpoint.url ?? endpoint.mcpUrl ?? '/',
      sessionId: endpoint.sessionId ?? '',
      runId: endpoint.runId ?? '',
      verdict: endpoint.status ?? '',
      blocked: false,
      count: 1,
      source: 'configured-endpoint',
      title: endpoint.name ?? endpoint.host ?? '',
      snippet: '',
      url: endpoint.url ?? endpoint.mcpUrl ?? '',
    }))
  }

  $: externalTargets = (Array.isArray(observedTargets) && observedTargets.length ? observedTargets : buildFallbackTargets()).slice(0, 8)
  $: if (!selectedTargetId && externalTargets.length > 0) {
    selectedTargetId = externalTargets[0].id
  }
  $: selectedTarget = externalTargets.find((item) => item.id === selectedTargetId) ?? externalTargets[0] ?? null
  $: canvasHeight = Math.max(880, 170 + externalTargets.length * 118)

  function rowTop(index) {
    return 150 + index * 118
  }

  function rowCenter(index) {
    return rowTop(index) + 55
  }

  function diagonalPath(index) {
    const startX = 860
    const startY = 414
    const endX = 1110
    const endY = rowCenter(index)
    const bend = 120
    return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
  }
</script>

<section data-view-panel="topology" class="view-panel topology-view">
  <article class="panel topology-canvas-panel">
    <div class="tree-shell topology-tree-shell">
      {#if externalTargets.length === 0}
        <div class="topology-empty-state">
          <strong>No observed downstream endpoints yet.</strong>
          <span>Run a governed search or fetch to populate the service topology with real external destinations.</span>
        </div>
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
        <div
          class="topology-map topology-external-map"
          class:is-panning={topologyPanning}
          use:nonPassiveWheel={onTopologyWheel}
          on:mousedown={startPan}
        >
          <div class="canvas-zoom-controls" aria-label="Topology canvas zoom controls">
            <button type="button" class="zoom-btn" on:click={() => nudgeTopologyZoom(-0.1)}>−</button>
            <button
              type="button"
              class="zoom-btn"
              on:click={() => {
                topologyZoom = 0.78
                topologyPanX = 0
                topologyPanY = 0
              }}
            >
              Reset
            </button>
            <button type="button" class="zoom-btn" on:click={() => nudgeTopologyZoom(0.1)}>+</button>
          </div>

          <div class="canvas-zoom-layer" style={`transform: translate(${topologyPanX}px, ${topologyPanY}px) scale(${topologyZoom});`}>
            <div class="topology-top-caption">
              <span class="topology-top-badge">Maple</span>
              <span class="topology-top-rules">Observed Egress</span>
            </div>

            <div class="topology-external-diagram" style={`min-height:${canvasHeight}px;`}>
              <div class="topology-box topology-box-center topology-box-mayple">
                <strong>Mayple</strong>
                <span>firewall and mediation boundary</span>
              </div>

              <svg class="topology-routing-svg" viewBox={`0 0 1640 ${canvasHeight}`} aria-hidden="true">
                {#each externalTargets as target, index (target.id)}
                  <path
                    d={diagonalPath(index)}
                    class={`topology-route topology-route-${toneForTarget(target)}`}
                  ></path>
                {/each}
              </svg>

              {#each externalTargets as target, index (target.id)}
                <div
                  class="topology-target-row"
                  style={`top:${rowTop(index)}px;`}
                >
                  <button
                    type="button"
                    class={`topology-box topology-target-node topology-target-node-${toneForTarget(target)} ${selectedTargetId === target.id ? 'selected' : ''}`}
                    on:click={() => {
                      selectedTargetId = target.id
                      if (target.sessionId || target.runId) {
                        queueInterventionHandoff({
                          sessionId: target.sessionId || target.runId || target.id,
                          label: target.label || target.host,
                        })
                      }
                    }}
                  >
                    <strong>{target.host}</strong>
                    <span>{compactPath(target.path)}</span>
                    {#if target.title}
                      <small>{compactTitle(target.title)}</small>
                    {/if}
                  </button>
                </div>
              {/each}
            </div>

            {#if selectedTarget}
              <aside class="topology-floating-inspector">
                <div class="topology-floating-inspector-head">
                  <div>
                    <p>Endpoint</p>
                    <h3>{selectedTarget.host}</h3>
                  </div>
                  <span class={`chip topology-chip topology-chip-${toneForTarget(selectedTarget)}`}>{toneForTarget(selectedTarget)}</span>
                </div>
                <dl class="topology-detail-grid">
                  <div><dt>Host</dt><dd>{selectedTarget.host}</dd></div>
                  <div><dt>Path</dt><dd>{selectedTarget.path || '/'}</dd></div>
                  <div><dt>Seen</dt><dd>{selectedTarget.count} run(s)</dd></div>
                  <div><dt>Source</dt><dd>{selectedTarget.source || 'observed'}</dd></div>
                  {#if selectedTarget.verdict}<div><dt>Verdict</dt><dd>{selectedTarget.verdict}</dd></div>{/if}
                  {#if selectedTarget.sessionId}<div><dt>Session</dt><dd>{selectedTarget.sessionId}</dd></div>{/if}
                </dl>
                {#if selectedTarget.title && selectedTarget.title !== selectedTarget.label}
                  <p class="topology-selected-copy"><strong>Title:</strong> {selectedTarget.title}</p>
                {/if}
                {#if selectedTarget.snippet}
                  <p class="topology-selected-copy">{selectedTarget.snippet}</p>
                {/if}
                <pre>{JSON.stringify(selectedTarget, null, 2)}</pre>
              </aside>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </article>
</section>

<style>
  .topology-empty-state {
    min-height: 640px;
    display: grid;
    place-items: center;
    gap: 0.6rem;
    text-align: center;
    color: rgba(240, 225, 206, 0.82);
  }

  .topology-empty-state strong {
    font-size: 1.35rem;
    color: #fff4e8;
  }

  .topology-external-map {
    min-height: 820px;
  }

  .topology-external-diagram {
    position: relative;
    width: 1640px;
    padding-bottom: 140px;
  }

  .topology-routing-svg {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
  }

  .topology-route {
    fill: none;
    stroke-width: 6;
    stroke-linecap: round;
    opacity: 0.94;
  }

  .topology-route-pending {
    stroke: rgba(255, 151, 29, 0.78);
  }

  .topology-route-observed {
    stroke: rgba(95, 227, 136, 0.84);
  }

  .topology-route-blocked {
    stroke: rgba(255, 119, 87, 0.86);
  }

  .topology-box-mayple {
    position: absolute;
    left: 420px;
    top: 340px;
    width: 440px;
    height: 150px;
    display: grid;
    place-items: center;
    text-align: center;
  }

  .topology-box-mayple strong {
    font-size: 2.25rem;
  }

  .topology-box-mayple span {
    font-size: 1.4rem;
  }

  .topology-target-row {
    position: absolute;
    left: 1110px;
    width: 500px;
    height: 110px;
  }

  .topology-target-node {
    width: 500px;
    height: 110px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0.25rem;
    padding: 1.2rem 1.6rem;
    text-align: left;
  }

  .topology-target-node strong {
    font-size: 1.7rem;
    line-height: 1.08;
  }

  .topology-target-node span {
    font-size: 1rem;
    opacity: 0.86;
  }

  .topology-target-node small {
    font-size: 0.84rem;
    opacity: 0.72;
    line-height: 1.3;
  }

  .topology-target-node-pending {
    border-color: #ff9823;
  }

  .topology-target-node-observed {
    border-color: #4fd873;
    box-shadow: 0 0 0 1px rgba(79, 216, 115, 0.18);
  }

  .topology-target-node-blocked {
    border-color: #ff7c57;
    box-shadow: 0 0 0 1px rgba(255, 124, 87, 0.18);
  }

  .topology-target-node.selected {
    transform: translateY(-2px);
    box-shadow:
      0 20px 36px rgba(0, 0, 0, 0.22),
      0 0 0 2px rgba(255, 152, 35, 0.22);
  }

  .topology-floating-inspector {
    position: absolute;
    top: 28px;
    left: 26px;
    width: 360px;
    max-height: 520px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1rem 1.1rem;
    border: 1px solid rgba(255, 152, 35, 0.32);
    border-radius: 24px;
    background: rgba(36, 27, 18, 0.92);
    box-shadow: 0 22px 48px rgba(0, 0, 0, 0.34);
    backdrop-filter: blur(10px);
  }

  .topology-floating-inspector-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .topology-floating-inspector-head p {
    margin: 0 0 0.25rem;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(255, 193, 137, 0.74);
  }

  .topology-floating-inspector-head h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #fff1df;
  }

  .topology-chip {
    text-transform: capitalize;
  }

  .topology-chip-pending {
    background: rgba(255, 152, 35, 0.18);
    color: #ffc587;
  }

  .topology-chip-observed {
    background: rgba(79, 216, 115, 0.18);
    color: #9ef2b0;
  }

  .topology-chip-blocked {
    background: rgba(255, 124, 87, 0.18);
    color: #ffc2b1;
  }

  .topology-detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin: 0;
  }

  .topology-detail-grid div {
    min-width: 0;
  }

  .topology-detail-grid dt {
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(255, 193, 137, 0.68);
    margin-bottom: 0.18rem;
  }

  .topology-detail-grid dd {
    margin: 0;
    color: #fff1df;
    font-size: 0.95rem;
    word-break: break-word;
  }

  .topology-selected-copy {
    margin: 0;
    color: rgba(255, 234, 215, 0.82);
    line-height: 1.5;
  }

  .topology-floating-inspector pre {
    margin: 0;
    padding: 0.9rem;
    border-radius: 18px;
    background: rgba(18, 14, 10, 0.9);
    color: #fce9d2;
    font-size: 0.78rem;
    line-height: 1.45;
    overflow: auto;
  }
</style>
