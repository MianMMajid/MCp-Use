<script>
  export let endpoints = []
  export let queueInterventionHandoff = () => {}
  let topologyZoom = 1
  let topologyPanX = 0
  let topologyPanY = 0
  let topologyPanning = false
  let panDrag = null

  const displayEndpoints = (Array.isArray(endpoints) ? endpoints : []).slice(0, 2)
  $: leftNode = {
    title: 'ClaudeBot',
    subtitle: 'agent runtime',
  }
  $: centerNode = {
    title: 'Mayple',
    subtitle: 'MCP server + firewall',
  }
  $: rightNodes = displayEndpoints.length
    ? displayEndpoints.map((endpoint) => ({
        title: endpoint.host,
        subtitle: `policy: ${String(endpoint.status || 'pending')}`,
        sessionId: endpoint.sessionId || `session-topology-${endpoint.host}`,
      }))
    : [
        { title: 'mcp.so', subtitle: 'policy: pending', sessionId: 'session-topology-1' },
        { title: 'docs.mcp.so', subtitle: 'policy: pending', sessionId: 'session-topology-2' },
      ]

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

  function startPan(event) {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.canvas-zoom-controls')) return
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
</script>

<section data-view-panel="topology" class="view-panel topology-view">
  <article class="panel topology-canvas-panel">
    <div class="tree-shell topology-tree-shell">
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
      <div
        class="topology-map"
        class:is-panning={topologyPanning}
        on:wheel={onTopologyWheel}
        on:mousedown={startPan}
      >
        <div class="canvas-zoom-controls" aria-label="Topology canvas zoom controls">
          <button type="button" class="zoom-btn" on:click={() => nudgeTopologyZoom(-0.1)}>−</button>
          <button type="button" class="zoom-btn" on:click={() => { topologyZoom = 1; topologyPanX = 0; topologyPanY = 0; }}>Reset</button>
          <button type="button" class="zoom-btn" on:click={() => nudgeTopologyZoom(0.1)}>+</button>
        </div>
        <div class="canvas-zoom-layer" style={`transform: translate(${topologyPanX}px, ${topologyPanY}px) scale(${topologyZoom});`}>
          <div class="topology-top-caption">
            <span class="topology-top-badge">Maple</span>
            <span class="topology-top-rules">RULES</span>
          </div>
          <div class="topology-diagram">
            <div class="topology-box topology-box-left">
              <strong>{leftNode.title}</strong>
              <span>{leftNode.subtitle}</span>
            </div>
            <div class="topology-box topology-box-center">
              <strong>{centerNode.title}</strong>
              <span>{centerNode.subtitle}</span>
            </div>
            <button
              type="button"
              class="topology-box topology-box-right-top"
              on:click={() => queueInterventionHandoff({ sessionId: rightNodes[0].sessionId, label: rightNodes[0].title })}
            >
              <strong>{rightNodes[0].title}</strong>
              <span>{rightNodes[0].subtitle}</span>
            </button>
            <button
              type="button"
              class="topology-box topology-box-right-bottom"
              on:click={() =>
                queueInterventionHandoff({
                  sessionId: rightNodes[1]?.sessionId ?? rightNodes[0].sessionId,
                  label: rightNodes[1]?.title ?? rightNodes[0].title,
                })}
            >
              <strong>{rightNodes[1]?.title ?? rightNodes[0].title}</strong>
              <span>{rightNodes[1]?.subtitle ?? rightNodes[0].subtitle}</span>
            </button>

            <div class="topology-connector topology-connector-main"></div>
            <div class="topology-connector topology-connector-branch-a"></div>
            <div class="topology-connector topology-connector-branch-b"></div>
          </div>
        </div>
      </div>
    </div>
  </article>
</section>
