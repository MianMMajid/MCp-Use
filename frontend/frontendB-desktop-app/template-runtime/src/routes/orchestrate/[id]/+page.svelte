<script>
  import '@xyflow/svelte/dist/style.css';
  import { onDestroy, onMount } from 'svelte';
  import { SvelteFlow, Background, Controls, addEdge, MarkerType } from '@xyflow/svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, patchJson, postJson } from '@/lib/api';
  import { chatStore } from '@/lib/stores/chat-store';
  import AgentPalette from '@/lib/components/orchestration/agent-palette.svelte';
  import NodeConfigPanel from '@/lib/components/orchestration/node-config-panel.svelte';
  import EdgeConfigPanel from '@/lib/components/orchestration/edge-config-panel.svelte';
  import FlowAgentNode from '@/lib/components/orchestration/flow-agent-node.svelte';

  export let data;

  const nodeTypes = {
    agentNode: FlowAgentNode,
  };

  let loading = true;
  let saving = false;
  let runtimeBusy = false;
  let error = '';

  let orchestration = null;
  let flowNodes = [];
  let flowEdges = [];
  let selectedNodeId = '';
  let selectedEdgeId = '';
  let viewport = { x: 0, y: 0, zoom: 1 };
  let flowSurfaceEl;

  let executionHistory = [];
  let currentExecutionId = '';
  let runtimeStatus = 'idle';
  let runtimeLoop = null;
  let runtimeTasks = [];
  let runtimeReassignments = [];
  let executionStream = null;
  let streamBoundExecutionId = '';

  $: selectedNode = mapFlowNodeToPanel(flowNodes.find((item) => item.id === selectedNodeId) || null);
  $: selectedEdge = mapFlowEdgeToPanel(flowEdges.find((item) => item.id === selectedEdgeId) || null);

  function edgeLabel(delegationPolicy) {
    return delegationPolicy?.requiresApproval
      ? 'approval'
      : delegationPolicy?.riskCeiling || 'open';
  }

  function fromApiNode(node) {
    return {
      id: node.id,
      type: 'agentNode',
      position: {
        x: Number(node.position?.x ?? 120),
        y: Number(node.position?.y ?? 120),
      },
      data: {
        label: node.label || node.id,
        agentId: node.agentId,
        role: node.role || '',
        config: node.config || {},
      },
    };
  }

  function toApiNode(node) {
    return {
      id: node.id,
      agentId: node.data?.agentId,
      label: node.data?.label || node.id,
      role: node.data?.role || null,
      position: {
        x: Number(node.position?.x ?? 120),
        y: Number(node.position?.y ?? 120),
      },
      config: node.data?.config || {},
    };
  }

  function fromApiEdge(edge) {
    const delegationPolicy = edge.delegationPolicy || {
      riskCeiling: 'medium',
      requiresApproval: true,
    };
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: {
        delegationPolicy,
      },
      label: edgeLabel(delegationPolicy),
    };
  }

  function toApiEdge(edge) {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      delegationPolicy: edge.data?.delegationPolicy || {
        riskCeiling: 'medium',
        requiresApproval: true,
      },
    };
  }

  function mapFlowNodeToPanel(node) {
    if (!node) return null;
    return {
      id: node.id,
      agentId: node.data?.agentId,
      label: node.data?.label || node.id,
      role: node.data?.role || '',
      x: Number(node.position?.x ?? 0),
      y: Number(node.position?.y ?? 0),
      config: node.data?.config || {},
    };
  }

  function mapFlowEdgeToPanel(edge) {
    if (!edge) return null;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      delegationPolicy: edge.data?.delegationPolicy || {
        riskCeiling: 'medium',
        requiresApproval: true,
      },
    };
  }

  async function loadOrchestration() {
    loading = true;
    error = '';
    try {
      const item = await loadJson(`/api/orchestrations/${data.id}`);
      orchestration = item;
      flowNodes = (item.nodes || []).map(fromApiNode);
      flowEdges = (item.edges || []).map(fromApiEdge);
      await loadExecutionHistory();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function loadExecutionHistory() {
    const payload = await loadJson(`/api/orchestrations/executions?orchestrationId=${data.id}&limit=20`).catch(() => ({ items: [] }));
    executionHistory = payload?.items || [];
    if (!currentExecutionId && executionHistory.length > 0) {
      currentExecutionId = String(executionHistory[0].executionId || executionHistory[0].id || '');
      if (currentExecutionId) await loadExecutionSnapshot(currentExecutionId);
    }
  }

  async function loadExecutionSnapshot(executionId) {
    if (!executionId) return;
    const payload = await loadJson(`/api/orchestrations/executions/${executionId}/snapshot`).catch(() => null);
    if (!payload?.ok) return;
    runtimeStatus = payload?.execution?.status || 'unknown';
    runtimeLoop = payload?.loopState || null;
    runtimeTasks = payload?.tasks || [];
    runtimeReassignments = payload?.reassignments || [];
  }

  function closeExecutionStream() {
    if (executionStream) {
      executionStream.close();
      executionStream = null;
      streamBoundExecutionId = '';
    }
  }

  function openExecutionStream(executionId) {
    if (typeof window === 'undefined') return;
    if (!executionId) {
      closeExecutionStream();
      return;
    }
    if (streamBoundExecutionId === executionId && executionStream) return;

    closeExecutionStream();
    streamBoundExecutionId = executionId;
    executionStream = new EventSource(`/api/orchestrations/executions/${executionId}/stream`);

    executionStream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (payload.loopState) runtimeLoop = payload.loopState;
        if (payload.status) runtimeStatus = payload.status;
        if (Array.isArray(payload.tasks)) runtimeTasks = payload.tasks;
        if (Array.isArray(payload.reassignments)) runtimeReassignments = payload.reassignments;
      } catch {
        // Ignore malformed stream payloads.
      }
    };

    executionStream.onerror = () => {
      closeExecutionStream();
    };
  }

  onMount(loadOrchestration);
  onDestroy(closeExecutionStream);

  $: openExecutionStream(currentExecutionId);

  async function saveDefinition() {
    if (!orchestration) return;
    saving = true;
    error = '';
    try {
      const payload = {
        nodes: flowNodes.map(toApiNode),
        edges: flowEdges.map(toApiEdge),
      };
      const response = await patchJson(`/api/orchestrations/${data.id}`, payload);
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      orchestration = await response.json().catch(() => orchestration);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  async function runAction(path, body = {}) {
    runtimeBusy = true;
    error = '';
    try {
      const response = await postJson(path, body);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Request failed (${response.status})`);
      return payload;
    } finally {
      runtimeBusy = false;
    }
  }

  async function validate() {
    await runAction(`/api/orchestrations/${data.id}/validate`, {});
  }

  async function publish() {
    await runAction(`/api/orchestrations/${data.id}/publish`, {});
  }

  async function execute(mode = 'live') {
    const payload = await runAction(`/api/orchestrations/${data.id}/execute`, {
      mode,
      objectivePackage: {
        goal: orchestration?.description || orchestration?.name || data.id,
        successCriteria: 'Complete orchestration objective',
        runtimeLimitMinutes: 60,
        budgetUsd: 100,
        riskCeiling: 'medium',
        contextUrls: [],
        outputContract: 'Structured summary',
        escalationPolicy: 'Escalate on repeated failure',
      },
      conversationContext: [],
    });
    currentExecutionId = String(payload?.executionId || currentExecutionId || '');
    await loadExecutionHistory();
    if (currentExecutionId) await loadExecutionSnapshot(currentExecutionId);
  }

  async function pause() {
    if (!currentExecutionId) return;
    await runAction(`/api/orchestrations/executions/${currentExecutionId}/pause`, {});
    await loadExecutionSnapshot(currentExecutionId);
  }

  async function resume() {
    if (!currentExecutionId) return;
    await runAction(`/api/orchestrations/executions/${currentExecutionId}/resume`, {});
    await loadExecutionSnapshot(currentExecutionId);
  }

  async function cancel() {
    if (!currentExecutionId) return;
    await runAction(`/api/orchestrations/executions/${currentExecutionId}/cancel`, {});
    await loadExecutionSnapshot(currentExecutionId);
  }

  async function mutateAddNode() {
    if (!currentExecutionId) return;
    await runAction(`/api/orchestrations/executions/${currentExecutionId}/mutate`, {
      op: 'add_node',
      node: { label: `Dynamic ${Date.now()}` },
    });
    await loadExecutionSnapshot(currentExecutionId);
  }

  function onConnect(connection) {
    const id = `edge-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const delegationPolicy = { riskCeiling: 'medium', requiresApproval: true };
    flowEdges = addEdge(
      {
        ...connection,
        id,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { delegationPolicy },
        label: edgeLabel(delegationPolicy),
      },
      flowEdges,
    );
  }

  function onFlowDrop(event) {
    event.preventDefault();
    const agentId = event.dataTransfer?.getData('application/orchestration-agent');
    if (!agentId || !flowSurfaceEl) return;

    const bounds = flowSurfaceEl.getBoundingClientRect();
    const x = (event.clientX - bounds.left - viewport.x) / viewport.zoom;
    const y = (event.clientY - bounds.top - viewport.y) / viewport.zoom;
    const id = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    flowNodes = [
      ...flowNodes,
      {
        id,
        type: 'agentNode',
        position: { x: Math.max(20, x), y: Math.max(20, y) },
        data: {
          label: agentId,
          agentId,
          role: '',
          config: {},
        },
      },
    ];
  }

  function onFlowDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function updateNode(nextNode) {
    flowNodes = flowNodes.map((item) =>
      item.id === nextNode.id
        ? {
            ...item,
            data: {
              ...item.data,
              label: nextNode.label,
              role: nextNode.role || '',
              config: nextNode.config || {},
            },
          }
        : item,
    );
  }

  function removeNode(nodeId) {
    flowNodes = flowNodes.filter((item) => item.id !== nodeId);
    flowEdges = flowEdges.filter((item) => item.source !== nodeId && item.target !== nodeId);
    if (selectedNodeId === nodeId) selectedNodeId = '';
  }

  function updateEdge(nextEdge) {
    flowEdges = flowEdges.map((item) => {
      if (item.id !== nextEdge.id) return item;
      const delegationPolicy = nextEdge.delegationPolicy || {
        riskCeiling: 'medium',
        requiresApproval: true,
      };
      return {
        ...item,
        data: { ...(item.data || {}), delegationPolicy },
        label: edgeLabel(delegationPolicy),
      };
    });
  }

  function removeEdge(edgeId) {
    flowEdges = flowEdges.filter((item) => item.id !== edgeId);
    if (selectedEdgeId === edgeId) selectedEdgeId = '';
  }
</script>

<AppShell>
  <section class="page">
    <header class="head card">
      <div>
        <h1>{orchestration?.name || data.id}</h1>
        <p>Drag agents from left into XYFlow canvas. Connect nodes directly to define delegation graph.</p>
      </div>
      <div class="actions">
        <button class="pill" on:click={saveDefinition} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        <button class="pill" on:click={validate} disabled={runtimeBusy}>Validate</button>
        <button class="pill" on:click={publish} disabled={runtimeBusy}>Publish</button>
      </div>
    </header>

    <div class="canvas card">
      <AgentPalette agents={$chatStore.agents || []} nodes={flowNodes.map(mapFlowNodeToPanel)} />

      <div class="board-wrap">
        <div class="runtime-strip">
          <select bind:value={currentExecutionId} on:change={(e) => loadExecutionSnapshot(e.currentTarget.value)}>
            <option value="">Select execution</option>
            {#each executionHistory as item}
              <option value={item.executionId || item.id}>{item.executionId || item.id} · {item.status || 'unknown'}</option>
            {/each}
          </select>
          <button class="pill" on:click={() => execute('live')} disabled={runtimeBusy}>Start Live</button>
          <button class="pill" on:click={() => execute('dry_run')} disabled={runtimeBusy}>Dry Run</button>
          <button class="pill" on:click={pause} disabled={runtimeBusy || !currentExecutionId}>Pause</button>
          <button class="pill" on:click={resume} disabled={runtimeBusy || !currentExecutionId}>Resume</button>
          <button class="pill danger" on:click={cancel} disabled={runtimeBusy || !currentExecutionId}>Cancel</button>
          <button class="pill" on:click={mutateAddNode} disabled={runtimeBusy || !currentExecutionId}>Mutate +Node</button>
          <span class="status">{runtimeStatus}{#if runtimeLoop} · {runtimeLoop.phase}#{runtimeLoop.iteration}{/if}</span>
        </div>

        <div
          class="flow-surface"
          bind:this={flowSurfaceEl}
          on:dragover={onFlowDragOver}
          on:drop={onFlowDrop}
        >
          <SvelteFlow
            bind:nodes={flowNodes}
            bind:edges={flowEdges}
            bind:viewport={viewport}
            {nodeTypes}
            fitView={true}
            onconnect={onConnect}
            onnodeclick={({ node }) => {
              selectedNodeId = node.id;
              selectedEdgeId = '';
            }}
            onedgeclick={({ edge }) => {
              selectedEdgeId = edge.id;
              selectedNodeId = '';
            }}
            onpaneclick={() => {
              selectedNodeId = '';
              selectedEdgeId = '';
            }}
          >
            <Background />
            <Controls />
          </SvelteFlow>
        </div>

        <div class="runtime-lists">
          <div>
            <h3>Tasks</h3>
            {#if runtimeTasks.length === 0}
              <p class="muted">No tasks for current execution.</p>
            {:else}
              <ul>
                {#each runtimeTasks as task}
                  <li>{task.title || task.id} · {task.status} · {task.ownerAgentId || task.ownerRole || '--'}</li>
                {/each}
              </ul>
            {/if}
          </div>
          <div>
            <h3>Reassignment Queue</h3>
            {#if runtimeReassignments.length === 0}
              <p class="muted">No scheduled reassignments.</p>
            {:else}
              <ul>
                {#each runtimeReassignments as item}
                  <li>{item.taskId} → {item.targetAgentId || item.targetRole || '--'} @ {new Date(item.dueAt).toLocaleString()}</li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      </div>

      {#if selectedEdge}
        <EdgeConfigPanel edge={selectedEdge} onChange={updateEdge} onRemove={removeEdge} />
      {:else}
        <NodeConfigPanel node={selectedNode} onChange={updateNode} onRemove={removeNode} />
      {/if}
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    {#if loading}
      <p class="muted">Loading orchestration...</p>
    {/if}
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); display: grid; gap: 12px; }
  .head { padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h1 { margin: 0; font-size: 1.2rem; }
  .head p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .actions button { padding: 7px 10px; border-color: rgba(249,115,22,.35); background: rgba(20,24,32,.65); cursor: pointer; }

  .canvas { min-height: 620px; display: grid; grid-template-columns: auto 1fr auto; overflow: hidden; }
  .board-wrap { min-width: 0; display: grid; grid-template-rows: auto 1fr auto; }
  .runtime-strip { border-bottom: 1px solid rgba(255,255,255,.08); padding: 9px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .runtime-strip select { border: 1px solid rgba(255,255,255,.14); border-radius: 10px; background: rgba(20,24,32,.72); color: var(--fg); padding: 7px 9px; outline: none; min-width: 220px; }
  .runtime-strip button { padding: 7px 10px; border-color: rgba(249,115,22,.35); background: rgba(20,24,32,.65); cursor: pointer; }
  .runtime-strip .danger { border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); }
  .status { font-size: 12px; color: var(--muted); }

  .flow-surface {
    min-height: 420px;
    background: radial-gradient(circle at top left, rgba(249,115,22,.08), transparent 40%), rgba(12,15,22,.7);
  }

  .runtime-lists { border-top: 1px solid rgba(255,255,255,.08); padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .runtime-lists h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: var(--muted); }
  .runtime-lists ul { margin: 0; padding-left: 16px; display: grid; gap: 4px; }
  .runtime-lists li { font-size: 12px; }

  .error { margin: 0; color: #fecdd3; }
  .muted { margin: 0; color: var(--muted); }

  :global(.svelte-flow) {
    width: 100%;
    height: 100%;
  }

  :global(.svelte-flow__controls) {
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.12);
    background: rgba(20,24,32,.72);
  }

  :global(.svelte-flow__attribution) {
    background: rgba(14, 18, 24, 0.6);
    color: var(--muted);
    border-radius: 999px;
    padding: 2px 8px;
    margin: 8px;
  }

  @media (max-width: 1200px) {
    .canvas { grid-template-columns: 1fr; min-height: 820px; }
    :global(.palette), :global(.panel) { width: auto; border-right: 0; border-left: 0; border-top: 1px solid rgba(255,255,255,.08); }
  }
</style>
