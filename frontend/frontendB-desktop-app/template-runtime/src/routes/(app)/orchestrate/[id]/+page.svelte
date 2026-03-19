<script>
  import '@xyflow/svelte/dist/style.css';
  import { onDestroy, onMount } from 'svelte';
  import { SvelteFlow, Background, Controls, addEdge, MarkerType } from '@xyflow/svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, patchJson, postJson, invalidateCache } from '@/lib/api';
  import { chatStore } from '@/lib/stores/chat-store';
  import { toastStore } from '@/lib/stores/toast-store';
  import { humanizeError } from '@/lib/utils/error-display';
  import AgentPalette from '@/lib/components/orchestration/agent-palette.svelte';
  import NodeConfigPanel from '@/lib/components/orchestration/node-config-panel.svelte';
  import EdgeConfigPanel from '@/lib/components/orchestration/edge-config-panel.svelte';
  import FlowAgentNode from '@/lib/components/orchestration/flow-agent-node.svelte';

  export let data;

  const INSTRUCTION_NODE_ID = 'instruction-root';
  const OUTPUT_NODE_ID = 'output-sink';
  const nodeTypes = { agentNode: FlowAgentNode };

  let loading = true;
  let saving = false;
  let runtimeBusy = false;
  let runtimeBusyCount = 0;
  let error = '';
  let mounted = false;

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
  let runtimePollToken = 0;
  let executionStream = null;
  let streamBoundExecutionId = '';
  let controlPlaneNote = '';

  // Prompt & output
  let taskInput = '';
  let outputLog = [];
  let showOutput = false;

  $: selectedNode = mapFlowNodeToPanel(flowNodes.find((item) => item.id === selectedNodeId) || null);
  $: selectedEdge = mapFlowEdgeToPanel(flowEdges.find((item) => item.id === selectedEdgeId) || null);
  $: selectedNodeFirewall = selectedNode?.config?.firewallId
    ? (firewallLibrary || []).find((fw) => String(fw.id) === String(selectedNode.config.firewallId)) || null
    : null;
  $: runtimeBusy = runtimeBusyCount > 0;
  $: runtimeLive = ['running', 'live', 'in_progress', 'active'].some((token) => String(runtimeStatus || '').toLowerCase().includes(token));
  $: agentCount = flowNodes.filter((n) => !n.data?.isInstruction).length;

  // ── Helpers ────────────────────────────

  // Default delegation policy: no manual approval required — firewall policy evaluates automatically.
  const DEFAULT_DELEGATION_POLICY = { riskCeiling: 'medium', requiresApproval: false };

  function edgeLabel(dp) {
    return dp?.requiresApproval ? 'approval' : dp?.riskCeiling || 'open';
  }

  function makeInstructionNode() {
    return {
      id: INSTRUCTION_NODE_ID, type: 'agentNode',
      position: { x: 80, y: 180 },
      data: { label: 'instruction', agentId: 'instruction', role: 'instruction', isInstruction: true, config: {}, toolBadges: ['START'], hasFirewall: false },
    };
  }

  function makeOutputNode() {
    return {
      id: OUTPUT_NODE_ID, type: 'agentNode',
      position: { x: 700, y: 180 },
      data: { label: 'output', agentId: 'output', role: 'output', isOutput: true, isInstruction: true, config: {}, toolBadges: ['END'], hasFirewall: false },
    };
  }

  function ensureSpecialNodes(nodes) {
    let result = [...nodes];
    if (!result.find((n) => n.id === INSTRUCTION_NODE_ID)) result = [makeInstructionNode(), ...result];
    if (!result.find((n) => n.id === OUTPUT_NODE_ID)) result = [...result, makeOutputNode()];
    return result.map((n) => {
      if (n.id === INSTRUCTION_NODE_ID) return { ...n, data: { ...(n.data || {}), label: 'instruction', agentId: 'instruction', role: 'instruction', isInstruction: true, toolBadges: ['START'] } };
      if (n.id === OUTPUT_NODE_ID) return { ...n, data: { ...(n.data || {}), label: 'output', agentId: 'output', role: 'output', isOutput: true, isInstruction: true, toolBadges: ['END'] } };
      return n;
    });
  }

  // Keep old name as alias for compatibility
  function ensureInstructionNode(nodes) { return ensureSpecialNodes(nodes); }

  function toolBadgesFor(agent = {}) {
    const src = `${agent?.name || ''} ${(agent?.capabilities || []).join(' ')}`.toLowerCase();
    const b = [];
    if (src.includes('github') || src.includes('code')) b.push('GH');
    if (src.includes('slack') || src.includes('comms')) b.push('SL');
    if (src.includes('email')) b.push('EM');
    if (src.includes('policy') || src.includes('risk')) b.push('SEC');
    if (b.length === 0) b.push('OC');
    return b.slice(0, 3);
  }

  let firewallLibrary = [];
  async function readFirewallLibrary() {
    try {
      const p = await loadJson('/api/firewalls');
      const items = p?.items ?? p ?? [];
      return Array.isArray(items) ? items.filter((i) => !i?.archived) : [];
    } catch { return []; }
  }

  function fromApiNode(node) {
    const isInstr = String(node.id || '') === INSTRUCTION_NODE_ID || String(node.role || '') === 'instruction';
    const agent = ($chatStore.agents || []).find((a) => String(a.agentId || a.id) === String(node.agentId));
    return {
      id: node.id, type: 'agentNode',
      position: { x: Number(node.position?.x ?? 120), y: Number(node.position?.y ?? 120) },
      data: { label: isInstr ? 'instruction' : (node.label || node.id), agentId: isInstr ? 'instruction' : node.agentId, role: isInstr ? 'instruction' : (node.role || ''), isInstruction: isInstr, config: node.config || {}, toolBadges: isInstr ? ['START'] : toolBadgesFor(agent || node) },
    };
  }

  function toApiNode(n) {
    const isInstr = String(n.id) === INSTRUCTION_NODE_ID || n.data?.isInstruction;
    return { id: n.id, agentId: isInstr ? 'instruction' : n.data?.agentId, label: isInstr ? 'instruction' : (n.data?.label || n.id), role: isInstr ? 'instruction' : (n.data?.role || null), position: { x: Number(n.position?.x ?? 120), y: Number(n.position?.y ?? 120) }, config: n.data?.config || {} };
  }

  function fromApiEdge(e) {
    const dp = { ...DEFAULT_DELEGATION_POLICY, ...(e.delegationPolicy || {}) };
    return { id: e.id, source: e.source, target: e.target, markerEnd: { type: MarkerType.ArrowClosed }, data: { delegationPolicy: dp }, label: edgeLabel(dp) };
  }
  function toApiEdge(e) {
    return { id: e.id, source: e.source, target: e.target, delegationPolicy: { ...DEFAULT_DELEGATION_POLICY, ...(e.data?.delegationPolicy || {}) } };
  }

  const SPECIAL_IDS = new Set([INSTRUCTION_NODE_ID, OUTPUT_NODE_ID]);
  function persistentFlowNodes(nodes) { return ensureInstructionNode(nodes).filter((n) => !SPECIAL_IDS.has(String(n.id)) && !n.data?.isInstruction && !n.data?.isOutput); }
  function persistentFlowEdges(edges) { return edges.filter((e) => !SPECIAL_IDS.has(String(e.source)) && !SPECIAL_IDS.has(String(e.target))); }
  function mapFlowNodeToPanel(n) { if (!n) return null; return { id: n.id, agentId: n.data?.agentId, label: n.data?.label || n.id, role: n.data?.role || '', isInstruction: Boolean(n.data?.isInstruction), x: Number(n.position?.x ?? 0), y: Number(n.position?.y ?? 0), config: n.data?.config || {} }; }
  function mapFlowEdgeToPanel(e) { if (!e) return null; return { id: e.id, source: e.source, target: e.target, delegationPolicy: e.data?.delegationPolicy || { riskCeiling: 'medium', requiresApproval: true } }; }

  function applyNodeVisualContext() {
    flowNodes = ensureInstructionNode(flowNodes.map((n) => {
      if (n.id === INSTRUCTION_NODE_ID) return { ...n, data: { ...(n.data || {}), label: 'instruction', agentId: 'instruction', role: 'instruction', isInstruction: true, toolBadges: ['START'], hasFirewall: false } };
      if (n.id === OUTPUT_NODE_ID) return { ...n, data: { ...(n.data || {}), label: 'output', agentId: 'output', role: 'output', isOutput: true, isInstruction: true, toolBadges: ['END'], hasFirewall: false } };
      const agent = ($chatStore.agents || []).find((a) => String(a.agentId || a.id) === String(n.data?.agentId));
      return { ...n, data: { ...(n.data || {}), toolBadges: toolBadgesFor(agent || n.data || {}), isInstruction: false, isOutput: false, hasFirewall: Boolean(n.data?.config?.firewallId) } };
    }));
  }

  // ── Data loading ───────────────────────

  let _loadedOrchId = '';
  async function loadOrchestration() {
    if (_loadedOrchId === data.id && orchestration) return;
    _loadedOrchId = data.id;
    stopRuntimePolling();
    currentExecutionId = ''; closeExecutionStream();
    loading = true; error = '';
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
    } catch (err) { error = err instanceof Error ? err.message : String(err); }
    finally { loading = false; }
  }

  async function loadExecutionHistory() {
    const p = await loadJson(`/api/orchestrations/executions?orchestrationId=${data.id}&limit=20`).catch(() => ({ items: [] }));
    executionHistory = p?.items || [];
    const latestExecutionId = String(executionHistory[0]?.executionId || executionHistory[0]?.id || '');
    if (!currentExecutionId && latestExecutionId) {
      currentExecutionId = latestExecutionId;
      await loadExecutionSnapshot(latestExecutionId);
    }
  }

  async function loadExecutionSnapshot(executionId) {
    if (!executionId) return;
    const p = await loadJson(`/api/orchestrations/executions/${executionId}/snapshot`).catch(() => null);
    if (!p) return;
    runtimeStatus = p?.execution?.status || 'pending';
    runtimeLoop = p?.loopState || null;
  }

  // ── SSE stream ─────────────────────────

  let streamRetryCount = 0;
  let streamRetryTimer = null;

  function closeExecutionStream() {
    if (streamRetryTimer) { clearTimeout(streamRetryTimer); streamRetryTimer = null; }
    if (executionStream) { executionStream.close(); executionStream = null; streamBoundExecutionId = ''; }
  }

  function openExecutionStream(executionId) {
    if (typeof window === 'undefined') return;
    if (!executionId) { closeExecutionStream(); return; }
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
        const p = JSON.parse(event.data || '{}');
        if (p.loopState) runtimeLoop = p.loopState;
        if (p.status) runtimeStatus = p.status;
        // Capture events to output log
        if (p.eventType || p.event) {
          const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const type = p.eventType || p.event || 'event';
          const nodeId = p.nodeId || '';
          const preview = p.outputPreview || p.error || p.reason || '';
          outputLog = [...outputLog, { ts, type, nodeId, preview: preview.slice(0, 300) }];
        }
      } catch {}
    };
    executionStream.onerror = () => {
      closeExecutionStream();
      if (streamRetryCount < 5) {
        streamRetryCount++;
        streamRetryTimer = setTimeout(() => connectExecutionStream(executionId), Math.min(1000 * Math.pow(2, streamRetryCount - 1), 16000));
      }
    };
  }

  onMount(() => {
    mounted = true;
  });
  onDestroy(closeExecutionStream);
  $: if (mounted) loadOrchestration();
  $: openExecutionStream(currentExecutionId);
  $: if ($chatStore.agents && !loading) applyNodeVisualContext();

  // ── Actions ────────────────────────────

  async function saveDefinition() {
    if (!orchestration) return;
    saving = true; error = '';
    try {
      const payload = { name: orchestrationName.trim() || data.id, description: orchestrationInstructions, nodes: persistentFlowNodes(flowNodes).map(toApiNode), edges: persistentFlowEdges(flowEdges).map(toApiEdge) };
      const r = await patchJson(`/api/orchestrations/${data.id}`, payload, { silent: true });
      if (!r.ok) throw new Error(`Save failed (${r.status})`);
      orchestration = await r.json().catch(() => orchestration);
      invalidateCache('/api/orchestrations');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      toastStore.error(humanizeError(error));
    } finally { saving = false; }
  }

  function definitionPayload() {
    return {
      name: orchestrationName.trim() || data.id,
      description: orchestrationInstructions,
      nodes: persistentFlowNodes(flowNodes).map(toApiNode),
      edges: persistentFlowEdges(flowEdges).map(toApiEdge),
    };
  }

  async function runAction(path, body = {}) {
    runtimeBusyCount += 1;
    error = '';
    try {
      const r = await postJson(path, body, { silent: true });
      const p = await r.json().catch(() => ({}));
      if (!r.ok || p?.ok === false) throw new Error(p?.error || `Request failed (${r.status})`);
      return p;
    } finally {
      runtimeBusyCount = Math.max(0, runtimeBusyCount - 1);
    }
  }

  async function validateDefinition() {
    const p = await runAction(`/api/orchestrations/${data.id}/validate`, definitionPayload());
    const errorCount = Array.isArray(p?.errors) ? p.errors.length : 0;
    const warningCount = Array.isArray(p?.warnings) ? p.warnings.length : 0;
    controlPlaneNote = errorCount > 0
      ? `Validation failed with ${errorCount} error${errorCount === 1 ? '' : 's'}.`
      : `Validation passed${warningCount > 0 ? ` with ${warningCount} warning${warningCount === 1 ? '' : 's'}` : ''}.`;
  }

  async function publishVersion() {
    const p = await runAction(`/api/orchestrations/${data.id}/publish`, definitionPayload());
    controlPlaneNote = `Published ${p?.publishedVersion || 'latest version'}.`;
  }

  async function execute(mode = 'live') {
    const objective = taskInput.trim() || orchestrationInstructions.trim() || orchestration?.name || data.id;
    if (!objective) { error = 'Enter a task first'; return; }

    runtimeBusyCount += 1;
    try {
      // Auto-save before executing
      await saveDefinition();
      if (error) return;

      if (mode === 'live') {
        await runAction(`/api/orchestrations/${data.id}/validate`, definitionPayload());
        await runAction(`/api/orchestrations/${data.id}/publish`, definitionPayload());
      }

      outputLog = [];
      showOutput = true;
      runtimeStatus = 'running';
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      outputLog = [{ ts, type: mode === 'dry-run' ? 'dry_run_started' : 'execution_started', nodeId: '', preview: objective }];
      const p = await runAction(`/api/orchestrations/${data.id}/execute`, {
        mode,
        objectivePackage: { goal: objective, successCriteria: 'Complete delegated subtasks', runtimeLimitMinutes: 60, budgetUsd: 100, riskCeiling: 'medium', contextUrls: [], outputContract: 'Structured summary', escalationPolicy: 'Escalate on repeated failure' },
        conversationContext: [{ role: 'user', content: objective }],
      });
      currentExecutionId = String(p?.executionId || '');
      controlPlaneNote = mode === 'dry-run' ? 'Dry run requested.' : 'Live execution started.';
      await loadExecutionHistory();
      if (currentExecutionId) {
        await loadExecutionSnapshot(currentExecutionId);
        // Poll for completion since execution may finish before SSE connects
        startRuntimePolling(currentExecutionId);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      runtimeStatus = 'failed';
      toastStore.error(humanizeError(error));
      const ts2 = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      outputLog = [...outputLog, { ts: ts2, type: 'execution_failed', nodeId: '', preview: err instanceof Error ? err.message : String(err) }];
    } finally {
      runtimeBusyCount = Math.max(0, runtimeBusyCount - 1);
    }
  }

  async function pauseExecution() {
    if (!currentExecutionId) return;
    const p = await runAction(`/api/orchestrations/executions/${currentExecutionId}/pause`, {});
    stopRuntimePolling();
    runtimeStatus = p?.execution?.status || 'paused';
    controlPlaneNote = 'Execution paused.';
  }

  async function resumeExecution() {
    if (!currentExecutionId) return;
    const p = await runAction(`/api/orchestrations/executions/${currentExecutionId}/resume`, {});
    runtimeStatus = p?.execution?.status || 'running';
    startRuntimePolling(currentExecutionId);
    controlPlaneNote = 'Execution resumed.';
  }

  function stopRuntimePolling() {
    runtimePollToken += 1;
  }

  function startRuntimePolling(executionId) {
    if (!executionId) return;
    const pollToken = ++runtimePollToken;
    void pollForResult(executionId, pollToken);
  }

  async function pollForResult(executionId, pollToken) {
    const seenOutputs = new Set();

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (pollToken !== runtimePollToken) break;
      try {
        // Bust cache with timestamp to get fresh data each poll
        const cacheBust = `_t=${Date.now()}`;
        invalidateCache(`/api/orchestrations/executions/${executionId}`);
        const graph = await loadJson(`/api/orchestrations/executions/${executionId}/graph?${cacheBust}`);
        const snap = await loadJson(`/api/orchestrations/executions/${executionId}/snapshot?${cacheBust}`);
        const status = snap?.execution?.status || 'pending';
        runtimeStatus = status;
        const nodes = graph?.nodes || [];
        const ts = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        for (const n of nodes) {
          const nodeLabel = n.label || n.id;
          const key = `${n.id}:${n.status}`;

          // Log running state (once)
          if (n.status === 'running' && !seenOutputs.has(`${n.id}:running`)) {
            seenOutputs.add(`${n.id}:running`);
            outputLog = [...outputLog, { ts: ts(), type: 'node_running', nodeId: nodeLabel, preview: '' }];
          }

          // Log completed with output (once, even if we already logged running)
          if ((n.status === 'succeeded' || n.status === 'failed') && !seenOutputs.has(`${n.id}:done`)) {
            seenOutputs.add(`${n.id}:done`);
            outputLog = [...outputLog, {
              ts: ts(),
              type: n.status === 'succeeded' ? 'node_succeeded' : 'node_failed',
              nodeId: nodeLabel,
              preview: (n.outputPreview || n.error || 'No output').slice(0, 800),
            }];
          }
        }

        if (['completed', 'failed', 'canceled'].includes(status)) {
          // Final read — re-check all nodes for outputs we missed
          for (const n of nodes) {
            const nodeLabel = n.label || n.id;
            if ((n.status === 'succeeded' || n.status === 'failed') && !seenOutputs.has(`${n.id}:done`)) {
              seenOutputs.add(`${n.id}:done`);
              outputLog = [...outputLog, {
                ts: ts(),
                type: n.status === 'succeeded' ? 'node_succeeded' : 'node_failed',
                nodeId: nodeLabel,
                preview: (n.outputPreview || n.error || 'No output').slice(0, 800),
              }];
            }
          }
          outputLog = [...outputLog, { ts: ts(), type: `execution_${status}`, nodeId: '', preview: '' }];
          break;
        }
      } catch { break; }
    }
  }

  async function cancelExecution() {
    if (!currentExecutionId) return;
    const p = await runAction(`/api/orchestrations/executions/${currentExecutionId}/cancel`, {});
    stopRuntimePolling();
    runtimeStatus = p?.execution?.status || 'canceled';
    controlPlaneNote = 'Execution canceled.';
  }

  async function addDynamicNode() {
    if (!currentExecutionId) return;
    const p = await runAction(`/api/orchestrations/executions/${currentExecutionId}/mutate`, {
      type: 'add-node',
      orchestrationId: data.id,
      node: {
        label: `Dynamic Node ${flowNodes.length}`,
        role: 'runtime',
      },
    });
    controlPlaneNote = `Dynamic node queued${p?.mutationId ? ` (${p.mutationId})` : ''}.`;
  }

  // ── Flow interactions ──────────────────

  function onConnect(connection) {
    const id = `edge-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const dp = { ...DEFAULT_DELEGATION_POLICY };
    flowEdges = addEdge({ ...connection, id, markerEnd: { type: MarkerType.ArrowClosed }, data: { delegationPolicy: dp }, label: edgeLabel(dp) }, flowEdges);
  }

  function onFlowDrop(event) {
    event.preventDefault();
    const agentId = event.dataTransfer?.getData('application/orchestration-agent');
    if (!agentId || !flowSurfaceEl) return;
    const bounds = flowSurfaceEl.getBoundingClientRect();
    const x = (event.clientX - bounds.left - viewport.x) / viewport.zoom;
    const y = (event.clientY - bounds.top - viewport.y) / viewport.zoom;
    const id = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const agent = ($chatStore.agents || []).find((a) => String(a.agentId || a.id) === String(agentId));
    flowNodes = [...flowNodes, { id, type: 'agentNode', position: { x: Math.max(20, x), y: Math.max(20, y) }, data: { label: agent?.name || agentId, agentId, role: '', isInstruction: false, config: {}, toolBadges: toolBadgesFor(agent || {}) } }];
    applyNodeVisualContext();
  }

  function onFlowDragOver(event) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }

  function updateNode(n) {
    flowNodes = flowNodes.map((item) => item.id === n.id ? { ...item, data: { ...item.data, label: item.id === INSTRUCTION_NODE_ID ? 'instruction' : n.label, role: item.id === INSTRUCTION_NODE_ID ? 'instruction' : (item.data?.role || ''), config: n.config || {} } } : item);
    applyNodeVisualContext();
  }
  function removeNode(nodeId) {
    if (SPECIAL_IDS.has(String(nodeId))) return;
    flowNodes = flowNodes.filter((i) => i.id !== nodeId);
    flowEdges = flowEdges.filter((i) => i.source !== nodeId && i.target !== nodeId);
    if (selectedNodeId === nodeId) selectedNodeId = '';
  }
  function updateEdge(e) {
    flowEdges = flowEdges.map((i) => { if (i.id !== e.id) return i; const dp = { ...DEFAULT_DELEGATION_POLICY, ...(e.delegationPolicy || {}) }; return { ...i, data: { ...(i.data || {}), delegationPolicy: dp }, label: edgeLabel(dp) }; });
  }
  function removeEdge(edgeId) { flowEdges = flowEdges.filter((i) => i.id !== edgeId); if (selectedEdgeId === edgeId) selectedEdgeId = ''; }
</script>

<AppShell>
  <section class="page">
    <!-- Header bar -->
    <header class="card topbar">
      <div class="topbar-left">
        <input class="name-input" bind:value={orchestrationName} placeholder="Orchestration name..." disabled={!mounted} />
        <div class="topbar-meta">
          <span class="meta-pill">{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
          <span class="meta-pill status-pill" class:running={runtimeLive} class:idle={runtimeStatus === 'idle'} class:failed={runtimeStatus === 'failed'} class:completed={runtimeStatus === 'completed'}>
            {runtimeStatus}
          </span>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="pill tiny" on:click={saveDefinition} disabled={!mounted || saving}>{saving ? 'Saving...' : 'Save'}</button>
        {#if runtimeLive}
          <button class="pill tiny danger" on:click={cancelExecution} disabled={!mounted || runtimeBusy}>Stop</button>
        {/if}
      </div>
    </header>

    <div class="control-bar">
      <div class="control-actions">
        <button class="pill tiny" on:click={() => execute('dry-run')} disabled={!mounted || runtimeBusy}>Dry Run</button>
        <button class="pill tiny cta" on:click={() => execute('live')} disabled={!mounted || runtimeBusy}>Run</button>
        {#if currentExecutionId && runtimeLive}
          {#if runtimeStatus === 'paused'}
            <button class="pill tiny" on:click={resumeExecution} disabled={!mounted || runtimeBusy}>Resume</button>
          {:else}
            <button class="pill tiny" on:click={pauseExecution} disabled={!mounted || runtimeBusy}>Pause</button>
          {/if}
          <button class="pill tiny danger" on:click={cancelExecution} disabled={!mounted || runtimeBusy}>Stop</button>
        {/if}
      </div>
      {#if controlPlaneNote}
        <span class="control-note">{controlPlaneNote}</span>
      {/if}
      <div class="control-links">
        <a class="pill tiny" href={`/?mode=orchestration&panel=timeline${currentExecutionId ? `&executionId=${encodeURIComponent(currentExecutionId)}` : ''}`}>Observability</a>
        <a class="pill tiny" href={`/?mode=orchestration&panel=timeline${currentExecutionId ? `&executionId=${encodeURIComponent(currentExecutionId)}` : ''}#audit`}>Audit</a>
      </div>
    </div>

    <!-- Main area: palette + canvas + output -->
    <div class="workspace card" class:has-output={showOutput}>
      <AgentPalette agents={$chatStore.agents || []} nodes={flowNodes.map(mapFlowNodeToPanel)} />

      <div class="canvas-area">
        <!-- Flow canvas -->
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
            onnodeclick={({ node }) => { selectedNodeId = node.id; selectedEdgeId = ''; }}
            onedgeclick={({ edge }) => { selectedEdgeId = edge.id; selectedNodeId = ''; }}
            onpaneclick={() => { selectedNodeId = ''; selectedEdgeId = ''; }}
          >
            <Background />
            <Controls />
          </SvelteFlow>
        </div>

        <!-- Prompt bar at bottom -->
        <div class="prompt-bar">
          <input
            class="prompt-input"
            bind:value={taskInput}
            placeholder="Describe the task to split across your agents..."
            disabled={!mounted}
            on:keydown={(e) => e.key === 'Enter' && !e.shiftKey && execute()}
          />
          <button class="run-btn" on:click={execute} disabled={!mounted || runtimeBusy}>
            {#if runtimeBusy}
              <span class="spinner"></span>
            {:else}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </button>
        </div>

        <!-- Config popup -->
        {#if selectedEdge || selectedNode}
          <div class="config-popup">
            {#if selectedEdge}
              <EdgeConfigPanel edge={selectedEdge} onChange={updateEdge} onRemove={removeEdge} />
            {:else}
              <NodeConfigPanel node={selectedNode} firewallLibrary={firewallLibrary} firewallOverview={selectedNodeFirewall} canDelete={!selectedNode?.isInstruction} onChange={updateNode} onRemove={removeNode} />
            {/if}
          </div>
        {/if}
      </div>

      <!-- Output panel -->
      {#if showOutput}
        {@const finalOutput = outputLog.filter((e) => e.type === 'node_succeeded' && e.preview).pop()}
        <aside class="output-panel">
          <div class="output-header">
            <h3>Output</h3>
            <button class="pill tiny" on:click={() => { showOutput = false; }}>Close</button>
          </div>

          {#if finalOutput}
            <div class="final-answer">
              <p class="final-text">{finalOutput.preview}</p>
            </div>
          {:else if runtimeLive}
            <div class="final-answer waiting">
              <span class="spinner"></span>
              <p class="final-text dim">Running agents...</p>
            </div>
          {/if}

          <div class="output-log">
            {#each outputLog as entry}
              <div class="log-entry" class:is-error={entry.type.includes('fail')} class:is-success={entry.type.includes('succeed') || entry.type.includes('complete')}>
                <div class="log-meta">
                  <span class="log-ts">{entry.ts}</span>
                  <span class="log-type">{entry.type.replace(/_/g, ' ')}</span>
                  {#if entry.nodeId}<span class="log-node">{entry.nodeId}</span>{/if}
                </div>
                {#if entry.preview}<p class="log-preview">{entry.preview}</p>{/if}
              </div>
            {/each}
            {#if outputLog.length === 0}
              <p class="log-empty">Waiting for execution events...</p>
            {/if}
          </div>
        </aside>
      {/if}
    </div>

    {#if error}<p class="err-msg">{humanizeError(error)}</p>{/if}
    {#if loading}<p class="muted">Loading orchestration...</p>{/if}
  </section>
</AppShell>

<style>
  .page {
    height: calc(100svh - 24px);
    display: grid;
    gap: 8px;
    grid-template-rows: auto auto 1fr;
  }

  .control-bar { padding: 6px 12px; display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-elevated); }
  .control-actions { display: flex; gap: 6px; }
  .control-links { display: flex; gap: 6px; margin-left: auto; }
  .control-bar .pill { cursor: pointer; }
  .control-bar a.pill { text-decoration: none; display: inline-flex; align-items: center; }
  .control-note { font-size: 11px; color: var(--muted); }

  /* ── Top bar ────────────────────── */
  .topbar { padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .name-input { border: 0; background: transparent; color: var(--fg); font-size: 15px; font-weight: 600; outline: none; min-width: 0; width: 280px; }
  .name-input::placeholder { color: var(--muted); }
  .topbar-meta { display: flex; gap: 6px; }
  .meta-pill { font-size: 10px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .status-pill.running { color: #10b981; border-color: rgba(16,185,129,.4); background: rgba(16,185,129,.1); }
  .status-pill.failed { color: #fb7185; border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.1); }
  .status-pill.completed { color: #60a5fa; border-color: rgba(96,165,250,.4); background: rgba(96,165,250,.1); }
  .topbar-actions { display: flex; gap: 6px; }
  .topbar-actions .pill { padding: 5px 10px; font-size: 12px; cursor: pointer; }
  .danger { border-color: rgba(251,113,133,.5) !important; background: rgba(251,113,133,.15) !important; color: #fb7185; }

  /* ── Workspace ──────────────────── */
  .workspace { min-height: 0; height: 100%; display: grid; grid-template-columns: auto 1fr; overflow: hidden; }
  .workspace.has-output { grid-template-columns: auto 1fr 320px; }

  .canvas-area { position: relative; min-width: 0; min-height: 0; display: grid; grid-template-rows: 1fr auto; }

  /* ── Flow ────────────────────────── */
  .flow-surface { min-height: 0; background: radial-gradient(circle at top left, rgba(249,115,22,.06), transparent 40%), var(--bg-elevated); }
  .flow-surface.live-traffic :global(.svelte-flow__edge-path) {
    stroke: rgba(16,185,129,.88) !important;
    stroke-dasharray: 8 6;
    animation: edge-flow 1.2s linear infinite;
  }
  @keyframes edge-flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -28; } }

  /* ── Prompt bar ─────────────────── */
  .prompt-bar { padding: 10px 12px; border-top: 1px solid var(--border); display: flex; gap: 8px; align-items: center; }
  .prompt-input {
    flex: 1;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-elevated);
    color: var(--fg);
    padding: 10px 16px;
    font-size: 13px;
    outline: none;
  }
  .prompt-input:focus { border-color: rgba(249,115,22,.4); }
  .prompt-input::placeholder { color: var(--muted); }
  .run-btn {
    width: 38px; height: 38px;
    border-radius: 50%;
    border: 1px solid rgba(249,115,22,.5);
    background: rgba(249,115,22,.2);
    color: var(--accent);
    cursor: pointer;
    display: grid; place-items: center;
    transition: all .15s;
    flex-shrink: 0;
  }
  .run-btn:hover:not(:disabled) { background: rgba(249,115,22,.35); }
  .run-btn:disabled { opacity: .4; cursor: default; }
  .spinner { width: 14px; height: 14px; border: 2px solid var(--accent); border-top-color: transparent; border-radius: 50%; animation: spin .6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Output panel ───────────────── */
  .output-panel {
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg);
  }
  .output-header { padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .output-header h3 { margin: 0; font-size: 12px; text-transform: uppercase; color: var(--muted); letter-spacing: .05em; }
  .output-header .pill { padding: 3px 8px; font-size: 11px; cursor: pointer; }
  .final-answer { padding: 14px 16px; border-bottom: 1px solid var(--border); }
  .final-answer.waiting { display: flex; align-items: center; gap: 10px; }
  .final-text { margin: 0; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
  .final-text.dim { color: var(--muted); }
  .output-log { flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
  .log-entry { padding: 6px 8px; border-radius: 8px; background: var(--bg-elevated); border: 1px solid var(--border); display: grid; gap: 3px; }
  .log-entry.is-error { border-color: rgba(251,113,133,.3); }
  .log-entry.is-success { border-color: rgba(16,185,129,.3); }
  .log-meta { display: flex; gap: 6px; align-items: center; }
  .log-ts { font-size: 9px; color: var(--muted); font-family: ui-monospace, monospace; }
  .log-type { font-size: 10px; font-weight: 600; }
  .log-node { font-size: 10px; color: var(--accent); font-family: ui-monospace, monospace; }
  .log-preview { margin: 0; font-size: 11px; color: var(--muted); line-height: 1.4; word-break: break-word; }
  .log-empty { color: var(--muted); font-size: 12px; text-align: center; padding: 20px; margin: 0; }

  /* ── Config popup ───────────────── */
  .config-popup {
    position: absolute; right: 14px; bottom: 60px; width: 320px; max-width: calc(100% - 28px); max-height: 60%; overflow: auto;
    border: 1px solid var(--border); border-radius: 14px; background: var(--bg-elevated); backdrop-filter: blur(10px);
    box-shadow: 0 14px 28px rgba(0,0,0,.35); z-index: 8;
  }
  .config-popup :global(.panel) { width: auto; border-left: 0; border-radius: 0; background: transparent; }

  /* ── Misc ────────────────────────── */
  .err-msg { margin: 0; color: #fb7185; font-size: 12px; padding: 0 4px; }
  .muted { margin: 0; color: var(--muted); }
  .tiny { font-size: 12px; }

  :global(.svelte-flow) { width: 100%; height: 100%; }
  :global(.svelte-flow__controls) { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: var(--bg-elevated); }
  :global(.svelte-flow__attribution) { background: var(--bg-elevated); color: var(--muted); border-radius: 999px; padding: 2px 8px; margin: 8px; }

  @media (max-width: 1200px) {
    .workspace { grid-template-columns: 1fr; }
    :global(.palette) { width: auto; border-right: 0; border-bottom: 1px solid var(--border); }
    .output-panel { border-left: 0; border-top: 1px solid var(--border); max-height: 240px; }
  }
</style>
