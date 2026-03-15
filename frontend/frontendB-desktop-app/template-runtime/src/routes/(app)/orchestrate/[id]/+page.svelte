<script>
  import '@xyflow/svelte/dist/style.css';
  import { onDestroy, onMount } from 'svelte';
  import { SvelteFlow, Background, Controls, addEdge, MarkerType } from '@xyflow/svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, patchJson, postJson, invalidateCache } from '@/lib/api';
  import { chatStore } from '@/lib/stores/chat-store';
  import AgentPalette from '@/lib/components/orchestration/agent-palette.svelte';
  import NodeConfigPanel from '@/lib/components/orchestration/node-config-panel.svelte';
  import EdgeConfigPanel from '@/lib/components/orchestration/edge-config-panel.svelte';
  import FlowAgentNode from '@/lib/components/orchestration/flow-agent-node.svelte';

  export let data;

  const INSTRUCTION_NODE_ID = 'instruction-root';
  const nodeTypes = { agentNode: FlowAgentNode };

  let loading = true;
  let saving = false;
  let runtimeBusy = false;
  let error = '';

  let orchestration = null;
  let orchestrationName = '';
  let orchestrationInstructions = '';
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
  let executionStream = null;
  let streamBoundExecutionId = '';

  let taskInput = '';
  let executionPlan = [];
  let firewallLibrary = [];

  $: selectedNode = mapFlowNodeToPanel(flowNodes.find((item) => item.id === selectedNodeId) || null);
  $: selectedEdge = mapFlowEdgeToPanel(flowEdges.find((item) => item.id === selectedEdgeId) || null);
  $: selectedNodeFirewall = selectedNode?.config?.firewallId
    ? firewallLibrary.find((fw) => String(fw.id) === String(selectedNode.config.firewallId)) || null
    : null;
  $: runtimeLive = ['running', 'live', 'in_progress', 'active'].some((token) => String(runtimeStatus || '').toLowerCase().includes(token));

  function edgeLabel(delegationPolicy) {
    return delegationPolicy?.requiresApproval ? 'approval' : delegationPolicy?.riskCeiling || 'open';
  }

  function makeInstructionNode() {
    return {
      id: INSTRUCTION_NODE_ID,
      type: 'agentNode',
      position: { x: 120, y: 180 },
      data: {
        label: 'instruction',
        agentId: 'instruction',
        role: 'instruction',
        isInstruction: true,
        config: {},
        toolBadges: ['START'],
        hasFirewall: false,
      },
    };
  }

  function ensureInstructionNode(nodes) {
    const existing = nodes.find((node) => node.id === INSTRUCTION_NODE_ID);
    if (!existing) return [makeInstructionNode(), ...nodes];
    return nodes.map((node) =>
      node.id === INSTRUCTION_NODE_ID
        ? {
            ...node,
            data: {
              ...(node.data || {}),
              label: 'instruction',
              agentId: 'instruction',
              role: 'instruction',
              isInstruction: true,
              toolBadges: ['START'],
            },
          }
        : node
    );
  }

  function toolBadgesFor(agent = {}) {
    const source = `${agent?.name || ''} ${(agent?.capabilities || []).join(' ')}`.toLowerCase();
    const badges = [];
    if (source.includes('github') || source.includes('code')) badges.push('GH');
    if (source.includes('slack') || source.includes('comms')) badges.push('SL');
    if (source.includes('email')) badges.push('EM');
    if (source.includes('policy') || source.includes('risk')) badges.push('SEC');
    if (badges.length === 0) badges.push('OC');
    return badges.slice(0, 3);
  }

  async function readFirewallLibrary() {
    try {
      const payload = await loadJson('/api/firewalls');
      const items = payload?.items ?? payload ?? [];
      return Array.isArray(items) ? items.filter((item) => !item?.archived) : [];
    } catch {
      return [];
    }
  }

  function fromApiNode(node) {
    const isInstruction = String(node.id || '') === INSTRUCTION_NODE_ID || String(node.role || '') === 'instruction';
    const agent = ($chatStore.agents || []).find((item) => String(item.agentId || item.id) === String(node.agentId));
    return {
      id: node.id,
      type: 'agentNode',
      position: {
        x: Number(node.position?.x ?? 120),
        y: Number(node.position?.y ?? 120),
      },
      data: {
        label: isInstruction ? 'instruction' : (node.label || node.id),
        agentId: isInstruction ? 'instruction' : node.agentId,
        role: isInstruction ? 'instruction' : (node.role || ''),
        isInstruction,
        config: node.config || {},
        toolBadges: isInstruction ? ['START'] : toolBadgesFor(agent || node),
      },
    };
  }

  function toApiNode(node) {
    const isInstruction = String(node.id) === INSTRUCTION_NODE_ID || node.data?.isInstruction;
    return {
      id: node.id,
      agentId: isInstruction ? 'instruction' : node.data?.agentId,
      label: isInstruction ? 'instruction' : (node.data?.label || node.id),
      role: isInstruction ? 'instruction' : (node.data?.role || null),
      position: {
        x: Number(node.position?.x ?? 120),
        y: Number(node.position?.y ?? 120),
      },
      config: node.data?.config || {},
    };
  }

  function fromApiEdge(edge) {
    const delegationPolicy = edge.delegationPolicy || { riskCeiling: 'medium', requiresApproval: true };
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { delegationPolicy },
      label: edgeLabel(delegationPolicy),
    };
  }

  function toApiEdge(edge) {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      delegationPolicy: edge.data?.delegationPolicy || { riskCeiling: 'medium', requiresApproval: true },
    };
  }

  function mapFlowNodeToPanel(node) {
    if (!node) return null;
    return {
      id: node.id,
      agentId: node.data?.agentId,
      label: node.data?.label || node.id,
      role: node.data?.role || '',
      isInstruction: Boolean(node.data?.isInstruction),
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
      delegationPolicy: edge.data?.delegationPolicy || { riskCeiling: 'medium', requiresApproval: true },
    };
  }

  function applyNodeVisualContext() {
    flowNodes = ensureInstructionNode(
      flowNodes.map((node) => {
        if (node.id === INSTRUCTION_NODE_ID || node.data?.isInstruction) {
          return {
            ...node,
            data: {
              ...(node.data || {}),
              label: 'instruction',
              agentId: 'instruction',
              role: 'instruction',
              isInstruction: true,
              toolBadges: ['START'],
              hasFirewall: false,
            },
          };
        }
        const agent = ($chatStore.agents || []).find((item) => String(item.agentId || item.id) === String(node.data?.agentId));
        return {
          ...node,
          data: {
            ...(node.data || {}),
            toolBadges: toolBadgesFor(agent || node.data || {}),
            isInstruction: false,
            hasFirewall: Boolean(node.data?.config?.firewallId),
          },
        };
      })
    );
  }

  let _loadedOrchId = '';

  async function loadOrchestration() {
    if (_loadedOrchId === data.id && orchestration) return;
    _loadedOrchId = data.id;
    // Reset state to prevent stale data from previous orchestration
    currentExecutionId = '';
    closeExecutionStream();
    loading = true;
    error = '';
    try {
      const item = await loadJson(`/api/orchestrations/${data.id}`);
      orchestration = item;
      firewallLibrary = await readFirewallLibrary();
      orchestrationName = item?.name || data.id;
      orchestrationInstructions = item?.description || '';
      flowNodes = ensureInstructionNode((item.nodes || []).map(fromApiNode));
      flowEdges = (item.edges || []).map(fromApiEdge);
      applyNodeVisualContext();
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
    if (!payload) return;
    runtimeStatus = payload?.execution?.status || 'unknown';
    runtimeLoop = payload?.loopState || null;
  }

  function closeExecutionStream() {
    if (streamRetryTimer) {
      clearTimeout(streamRetryTimer);
      streamRetryTimer = null;
    }
    if (executionStream) {
      executionStream.close();
      executionStream = null;
      streamBoundExecutionId = '';
    }
  }

  let streamRetryCount = 0;
  const MAX_STREAM_RETRIES = 5;
  let streamRetryTimer = null;

  function openExecutionStream(executionId) {
    if (typeof window === 'undefined') return;
    if (!executionId) {
      closeExecutionStream();
      return;
    }
    if (streamBoundExecutionId === executionId && executionStream) return;

    closeExecutionStream();
    streamRetryCount = 0;
    connectExecutionStream(executionId);
  }

  function connectExecutionStream(executionId) {
    streamBoundExecutionId = executionId;
    executionStream = new EventSource(`/api/orchestrations/executions/${executionId}/stream`);
    executionStream.onmessage = (event) => {
      try {
        streamRetryCount = 0;
        const payload = JSON.parse(event.data || '{}');
        if (payload.loopState) runtimeLoop = payload.loopState;
        if (payload.status) runtimeStatus = payload.status;
      } catch {
        // Ignore malformed payloads.
      }
    };
    executionStream.onerror = () => {
      closeExecutionStream();
      if (streamRetryCount < MAX_STREAM_RETRIES) {
        streamRetryCount++;
        const delay = Math.min(1000 * Math.pow(2, streamRetryCount - 1), 16000);
        streamRetryTimer = setTimeout(() => connectExecutionStream(executionId), delay);
      } else {
        error = 'Execution stream disconnected after max retries.';
      }
    };
  }

  onMount(loadOrchestration);
  onDestroy(closeExecutionStream);

  // Re-fetch when route param changes (same-route navigation)
  $: data.id, loadOrchestration();
  $: openExecutionStream(currentExecutionId);
  $: if ($chatStore.agents && !loading) {
    applyNodeVisualContext();
  }

  async function saveDefinition() {
    if (!orchestration) return;
    saving = true;
    error = '';
    try {
      const payload = {
        name: orchestrationName.trim() || data.id,
        description: orchestrationInstructions,
        nodes: ensureInstructionNode(flowNodes).map(toApiNode),
        edges: flowEdges.map(toApiEdge),
      };
      const response = await patchJson(`/api/orchestrations/${data.id}`, payload);
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      orchestration = await response.json().catch(() => orchestration);
      invalidateCache('/api/orchestrations');
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

  function generateExecutionPlan(taskText) {
    const text = String(taskText || '').trim();
    if (!text) return [];
    const workers = flowNodes.filter((node) => !node.data?.isInstruction).map((node) => node.data?.label || node.id);
    if (workers.length === 0) {
      return [{ id: `step-${Date.now()}`, owner: 'instruction', status: 'queued', objective: text }];
    }
    return workers.map((worker, idx) => ({
      id: `step-${Date.now()}-${idx}`,
      owner: worker,
      status: idx === 0 ? 'running' : 'queued',
      objective: `Subtask ${idx + 1}: ${text}`,
    }));
  }

  async function execute(mode = 'live') {
    const objective = taskInput.trim() || orchestrationInstructions.trim() || orchestration?.name || data.id;
    executionPlan = generateExecutionPlan(objective);
    runtimeStatus = mode === 'dry_run' ? 'dry_run' : 'running';
    const payload = await runAction(`/api/orchestrations/${data.id}/execute`, {
      mode,
      objectivePackage: {
        goal: objective,
        successCriteria: 'Complete delegated subtasks',
        runtimeLimitMinutes: 60,
        budgetUsd: 100,
        riskCeiling: 'medium',
        contextUrls: [],
        outputContract: 'Structured summary',
        escalationPolicy: 'Escalate on repeated failure',
      },
      conversationContext: [{ role: 'user', content: objective }],
    });
    currentExecutionId = String(payload?.executionId || currentExecutionId || '');
    await loadExecutionHistory();
    if (currentExecutionId) await loadExecutionSnapshot(currentExecutionId);
  }

  async function pause() {
    if (!currentExecutionId) return;
    await runAction(`/api/orchestrations/executions/${currentExecutionId}/pause`, {});
    runtimeStatus = 'paused';
    await loadExecutionSnapshot(currentExecutionId);
  }

  async function resume() {
    if (!currentExecutionId) return;
    await runAction(`/api/orchestrations/executions/${currentExecutionId}/resume`, {});
    runtimeStatus = 'running';
    await loadExecutionSnapshot(currentExecutionId);
  }

  async function cancel() {
    if (!currentExecutionId) return;
    await runAction(`/api/orchestrations/executions/${currentExecutionId}/cancel`, {});
    runtimeStatus = 'canceled';
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
      flowEdges
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
    const agent = ($chatStore.agents || []).find((item) => String(item.agentId || item.id) === String(agentId));
    flowNodes = [
      ...flowNodes,
      {
        id,
        type: 'agentNode',
        position: { x: Math.max(20, x), y: Math.max(20, y) },
        data: {
          label: agent?.name || agentId,
          agentId,
          role: '',
          isInstruction: false,
          config: {},
          toolBadges: toolBadgesFor(agent || {}),
        },
      },
    ];
    applyNodeVisualContext();
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
              label: item.id === INSTRUCTION_NODE_ID ? 'instruction' : nextNode.label,
              role: item.id === INSTRUCTION_NODE_ID ? 'instruction' : (item.data?.role || ''),
              config: nextNode.config || {},
            },
          }
        : item
    );
    applyNodeVisualContext();
  }

  function removeNode(nodeId) {
    if (String(nodeId) === INSTRUCTION_NODE_ID) return;
    flowNodes = flowNodes.filter((item) => item.id !== nodeId);
    flowEdges = flowEdges.filter((item) => item.source !== nodeId && item.target !== nodeId);
    if (selectedNodeId === nodeId) selectedNodeId = '';
  }

  function updateEdge(nextEdge) {
    flowEdges = flowEdges.map((item) => {
      if (item.id !== nextEdge.id) return item;
      const delegationPolicy = nextEdge.delegationPolicy || { riskCeiling: 'medium', requiresApproval: true };
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
      <div class="title-wrap">
        <h1>Orchestration Builder</h1>
        <label class="name-field">
          <span>name</span>
          <input bind:value={orchestrationName} placeholder="Name this orchestration..." />
        </label>
      </div>
      <div class="actions">
        <button class="pill" on:click={saveDefinition} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
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
          role="region"
          aria-label="Orchestration flow canvas"
          class:live-traffic={runtimeLive}
          bind:this={flowSurfaceEl}
          on:dragover={onFlowDragOver}
          on:drop={onFlowDrop}
        >
          <SvelteFlow
            bind:nodes={flowNodes}
            bind:edges={flowEdges}
            bind:viewport={viewport}
            {nodeTypes}
            nodeDragHandle=".agent-drag-handle"
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

        <div class="task-box">
          <label>
            <span>task</span>
            <textarea rows="2" bind:value={taskInput} placeholder="Give a task to execute and split across agents..."></textarea>
          </label>
          <button class="pill" on:click={() => execute('live')} disabled={runtimeBusy || !taskInput.trim()}>
            Execute Task
          </button>
          {#if executionPlan.length > 0}
            <div class="plan">
              {#each executionPlan as step}
                <article>
                  <p>{step.owner}</p>
                  <small>{step.status}</small>
                </article>
              {/each}
            </div>
          {/if}
        </div>

        {#if selectedEdge || selectedNode}
          <div class="config-popup">
            {#if selectedEdge}
              <EdgeConfigPanel edge={selectedEdge} onChange={updateEdge} onRemove={removeEdge} />
            {:else}
              <NodeConfigPanel
                node={selectedNode}
                firewallLibrary={firewallLibrary}
                firewallOverview={selectedNodeFirewall}
                canDelete={!selectedNode?.isInstruction}
                onChange={updateNode}
                onRemove={removeNode}
              />
            {/if}
          </div>
        {/if}
      </div>
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
  .page { min-height: calc(100svh - 24px); display: grid; gap: 12px; align-content: start; }
  .page { grid-template-rows: auto 1fr; }
  .head { padding: 12px; display: flex; align-items: start; justify-content: space-between; gap: 12px; }
  .title-wrap { min-width: 0; display: grid; gap: 6px; }
  h1 { margin: 0; font-size: 1.2rem; }
  .name-field { display: grid; gap: 4px; max-width: 420px; }
  .name-field span { color: var(--muted); font-size: 11px; text-transform: lowercase; }
  .name-field input {
    width: 100%;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 10px;
    background: rgba(20,24,32,.72);
    color: var(--fg);
    padding: 8px 10px;
    outline: none;
  }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .actions button { padding: 7px 10px; border-color: rgba(249,115,22,.35); background: rgba(20,24,32,.65); cursor: pointer; }

  .canvas { min-height: 0; height: 100%; display: grid; grid-template-columns: auto 1fr; overflow: hidden; }
  .board-wrap { position: relative; min-width: 0; min-height: 0; height: 100%; display: grid; grid-template-rows: auto 1fr auto; }

  .runtime-strip { border-bottom: 1px solid rgba(255,255,255,.08); padding: 9px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .runtime-strip select {
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 10px;
    background: rgba(20,24,32,.72);
    color: var(--fg);
    padding: 7px 9px;
    outline: none;
    min-width: 220px;
  }
  .runtime-strip button { padding: 7px 10px; border-color: rgba(249,115,22,.35); background: rgba(20,24,32,.65); cursor: pointer; }
  .runtime-strip .danger { border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); }
  .status { font-size: 12px; color: var(--muted); }

  .flow-surface {
    min-height: 0;
    background: radial-gradient(circle at top left, rgba(249,115,22,.08), transparent 40%), rgba(12,15,22,.7);
  }
  .flow-surface.live-traffic :global(.svelte-flow__edge-path) {
    stroke: rgba(16,185,129,.88) !important;
    stroke-dasharray: 8 6;
    animation: edge-flow 1.2s linear infinite;
  }
  @keyframes edge-flow {
    from { stroke-dashoffset: 0; }
    to { stroke-dashoffset: -28; }
  }

  .task-box {
    border-top: 1px solid rgba(255,255,255,.08);
    padding: 10px;
    display: grid;
    justify-items: center;
    gap: 8px;
  }
  .task-box label { width: min(720px, 100%); display: grid; gap: 4px; }
  .task-box span { color: var(--muted); font-size: 11px; text-transform: lowercase; }
  .task-box textarea {
    width: 100%;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 12px;
    background: rgba(20,24,32,.72);
    color: var(--fg);
    padding: 8px 10px;
    outline: none;
    resize: vertical;
  }
  .task-box button { padding: 7px 12px; border-color: rgba(249,115,22,.5); background: rgba(249,115,22,.2); cursor: pointer; }
  .plan { width: min(720px, 100%); display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
  .plan article {
    min-width: 120px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 10px;
    background: rgba(16,20,28,.62);
    padding: 7px 8px;
    display: grid;
    gap: 2px;
  }
  .plan p { margin: 0; font-size: 12px; font-weight: 600; }
  .plan small { color: var(--muted); font-size: 10px; text-transform: uppercase; }

  .config-popup {
    position: absolute;
    right: 14px;
    bottom: 14px;
    width: 320px;
    max-width: calc(100% - 28px);
    max-height: 70%;
    overflow: auto;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 14px;
    background: rgba(12,16,24,.94);
    backdrop-filter: blur(10px);
    box-shadow: 0 14px 28px rgba(0,0,0,.35);
    z-index: 8;
  }
  .config-popup :global(.panel) {
    width: auto;
    border-left: 0;
    border-radius: 0;
    background: transparent;
  }

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
    .canvas { grid-template-columns: 1fr; min-height: 0; }
    :global(.palette) { width: auto; border-right: 0; border-bottom: 1px solid rgba(255,255,255,.08); }
  }
</style>
