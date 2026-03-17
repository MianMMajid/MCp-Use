import { randomUUID } from "node:crypto";
import { asString } from "../helpers.js";
import { runOpenClawTurn } from "./openclaw-agent-runtime.js";
import { runNativeAgentTurn, agentRequiresNativeRuntime } from "./native-agent-runtime.js";
import { database } from "../state.js";

const executionStore = new Map();
const agentCache = new Map();
const executionWatchers = new Map();
let executionEventSequence = 0;

const TERMINAL_EXECUTION_STATUSES = new Set(["completed", "failed", "canceled"]);

const DEFAULT_DELEGATION_POLICY = {
  allowedTools: [],
  deniedTools: [],
  riskCeiling: "medium",
  requiresApproval: false,
  constraints: {
    timeboxSeconds: 300,
    rowLimit: 100,
    allowedEndpoints: [],
    rateLimit: 10,
  },
  escalationChainId: null,
};

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function asFinite(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toExecutionEvent(execution, eventType, payload = {}) {
  const sequence = ++executionEventSequence;
  return {
    id: `orch_evt_${execution.executionId}_${sequence}`,
    sequence,
    cursor: String(sequence),
    executionId: execution.executionId,
    orchestrationId: execution.orchestrationId,
    eventType,
    timestamp: nowIso(),
    payload,
  };
}

function emitExecutionEvent(execution, eventType, payload = {}) {
  const event = toExecutionEvent(execution, eventType, payload);
  execution.timeline.push(event);
  if (execution.timeline.length > 4000) {
    execution.timeline.splice(0, execution.timeline.length - 4000);
  }
  execution.updatedAt = event.timestamp;
  const watchers = executionWatchers.get(execution.executionId);
  if (watchers) {
    for (const callback of watchers) {
      try {
        callback(event);
      } catch {
        // best effort
      }
    }
  }
  return event;
}

function markControlChanged(execution) {
  execution.controlRevision = (execution.controlRevision ?? 0) + 1;
  execution.updatedAt = nowIso();
}

function normalizeDelegationPolicy(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    ...DEFAULT_DELEGATION_POLICY,
    ...source,
    constraints: {
      ...DEFAULT_DELEGATION_POLICY.constraints,
      ...(source.constraints && typeof source.constraints === "object" ? source.constraints : {}),
    },
  };
}

function extractNodeData(raw) {
  return raw?.data && typeof raw.data === "object" ? raw.data : {};
}

function isInstructionLikeNode(input) {
  const raw = input && typeof input === "object" ? input : {};
  const data = extractNodeData(raw);
  const id = asString(raw.id) ?? "";
  const role = asString(raw.role ?? data.role ?? raw.metadata?.role ?? raw.type ?? data.type) ?? "";
  const agentId = asString(raw.agentId ?? data.agentId) ?? "";
  const label = asString(raw.label ?? data.label ?? raw.name) ?? "";
  return (
    id === "instruction-root" ||
    role === "instruction" ||
    agentId === "instruction" ||
    label.toLowerCase() === "instruction-root"
  );
}

function normalizeNode(input, idx = 0) {
  const raw = input && typeof input === "object" ? input : {};
  const data = extractNodeData(raw);
  const id = asString(raw.id) ?? `node-${idx + 1}`;
  const metadata = raw.metadata && typeof raw.metadata === "object" ? { ...raw.metadata } : {};
  const isInstruction = isInstructionLikeNode(raw);
  const role = isInstruction
    ? "instruction"
    : asString(raw.role ?? data.role ?? metadata.role ?? raw.type ?? data.type) ?? "";
  const nodeObjective =
    asString(raw.nodeObjective ?? data.nodeObjective ?? data.objective ?? data.prompt ?? data.description) ?? "";
  if (isInstruction) {
    metadata.isInstruction = true;
    metadata.role = "instruction";
  }
  return {
    id,
    label: asString(raw.label ?? data.label) ?? asString(raw.name ?? data.name) ?? id,
    agentId: isInstruction ? "" : asString(raw.agentId ?? data.agentId) ?? "",
    role,
    position:
      raw.position && typeof raw.position === "object"
        ? raw.position
        : (data.position && typeof data.position === "object" ? data.position : { x: 0, y: 0 }),
    config: {
      ...(raw.config && typeof raw.config === "object" ? raw.config : {}),
      ...(data.config && typeof data.config === "object" ? data.config : {}),
    },
    dynamic: raw.dynamic === true || data.dynamic === true,
    spawned: raw.spawned === true || data.spawned === true,
    status: "pending",
    retryCount: 0,
    maxRetries: clamp(
      asInteger(raw.maxRetries ?? data.maxRetries ?? raw.config?.maxRetries ?? data.config?.maxRetries, 1),
      0,
      10,
    ),
    runId: "",
    outputPreview: "",
    error: "",
    startedAt: "",
    completedAt: "",
    nodeObjective,
    metadata: {
      ...metadata,
      ...(role ? { role } : {}),
    },
  };
}

function normalizeEdge(input, idx = 0) {
  const raw = input && typeof input === "object" ? input : {};
  const id = asString(raw.id) ?? `edge-${idx + 1}`;
  return {
    id,
    source: asString(raw.source) ?? "",
    target: asString(raw.target) ?? "",
    active: raw.active !== false,
    delegationPolicy: normalizeDelegationPolicy(raw.delegationPolicy),
  };
}

function cloneDefinition(definition) {
  const nodes = Array.isArray(definition?.nodes)
    ? definition.nodes.map((node, idx) => normalizeNode(node, idx))
    : [];
  const edges = Array.isArray(definition?.edges)
    ? definition.edges.map((edge, idx) => normalizeEdge(edge, idx))
    : [];
  return { nodes, edges };
}

function buildAdjacency(nodes, edges) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map();
  const outgoing = new Map();
  for (const node of nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    if (!edge.active) continue;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    incoming.get(edge.target).push(edge);
    outgoing.get(edge.source).push(edge);
  }
  return { incoming, outgoing };
}

function topologicalSort(nodes, edges) {
  const { incoming, outgoing } = buildAdjacency(nodes, edges);
  const indegree = new Map(nodes.map((node) => [node.id, incoming.get(node.id).length]));
  const queue = [];
  for (const [nodeId, degree] of indegree.entries()) {
    if (degree === 0) queue.push(nodeId);
  }
  const order = [];
  while (queue.length > 0) {
    const current = queue.shift();
    order.push(current);
    for (const edge of outgoing.get(current) ?? []) {
      const next = edge.target;
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  return { order, isDag: order.length === nodes.length };
}

export function validateOrchestrationDefinition(definition, options = {}) {
  const strict = options.strict === true;
  const errors = [];
  const warnings = [];

  const { nodes, edges } = cloneDefinition(definition ?? {});
  if (nodes.length === 0) {
    errors.push({ code: "NO_NODES", message: "At least one node is required." });
  }

  const nodeIds = new Set();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({ code: "DUPLICATE_NODE_ID", message: `Duplicate node id: ${node.id}` });
    }
    nodeIds.add(node.id);

    if (strict && !node.agentId && !node.metadata?.isInstruction) {
      errors.push({ code: "NODE_AGENT_REQUIRED", message: `Node ${node.id} is missing agentId.` });
    }
    if (!node.agentId && !node.metadata?.isInstruction) {
      warnings.push({ code: "NODE_AGENT_MISSING", message: `Node ${node.id} has no agentId; execution may fail.` });
    }
  }

  for (const edge of edges) {
    if (!edge.source || !edge.target) {
      errors.push({ code: "EDGE_ENDPOINT_REQUIRED", message: `Edge ${edge.id} is missing source or target.` });
      continue;
    }
    if (!nodeIds.has(edge.source)) {
      errors.push({ code: "EDGE_SOURCE_UNKNOWN", message: `Edge ${edge.id} source ${edge.source} not found.` });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({ code: "EDGE_TARGET_UNKNOWN", message: `Edge ${edge.id} target ${edge.target} not found.` });
    }
  }

  const { order, isDag } = topologicalSort(nodes, edges);
  if (!isDag) {
    errors.push({ code: "GRAPH_CYCLE", message: "Orchestration graph contains a cycle." });
  }

  const { incoming, outgoing } = buildAdjacency(nodes, edges);
  for (const node of nodes) {
    const inCount = (incoming.get(node.id) ?? []).length;
    const outCount = (outgoing.get(node.id) ?? []).length;
    if (inCount === 0 && outCount === 0 && nodes.length > 1) {
      warnings.push({ code: "ISOLATED_NODE", message: `Node ${node.id} is isolated.` });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    compiledGraph: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      topologicalOrder: order,
      nodes,
      edges,
    },
  };
}

function toPublicApproval(approval) {
  return {
    approvalId: approval.approvalId,
    executionId: approval.executionId,
    nodeId: approval.nodeId,
    edgeId: approval.edgeId,
    status: approval.status,
    requestedAt: approval.requestedAt,
    decidedAt: approval.decidedAt,
    challengeRequired: approval.challengeRequired,
    reason: approval.reason,
    action: approval.action,
  };
}

function toPublicNode(node) {
  return {
    id: node.id,
    label: node.label,
    agentId: node.agentId,
    role: node.role || node.metadata?.role || "",
    status: node.status,
    retryCount: node.retryCount,
    maxRetries: node.maxRetries,
    runId: node.runId,
    outputPreview: node.outputPreview,
    error: node.error,
    startedAt: node.startedAt,
    completedAt: node.completedAt,
    dynamic: node.dynamic,
    spawned: node.spawned,
    nodeObjective: node.nodeObjective || "",
    isInstruction: node.metadata?.isInstruction === true,
  };
}

function toPublicEdge(edge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    active: edge.active,
    delegationPolicy: edge.delegationPolicy,
  };
}

function toPublicExecution(execution) {
  return {
    executionId: execution.executionId,
    orchestrationId: execution.orchestrationId,
    definitionVersion: execution.definitionVersion,
    status: execution.status,
    mode: execution.mode,
    input: execution.input,
    context: execution.context,
    requestedBy: execution.requestedBy,
    createdAt: execution.createdAt,
    startedAt: execution.startedAt,
    updatedAt: execution.updatedAt,
    completedAt: execution.completedAt,
    runtimeGraphVersion: execution.runtimeGraphVersion,
    nodeCount: execution.graph.nodes.length,
    edgeCount: execution.graph.edges.length,
    approvals: execution.approvals.map(toPublicApproval),
    metrics: {
      succeededNodes: execution.graph.nodes.filter((node) => node.status === "succeeded").length,
      failedNodes: execution.graph.nodes.filter((node) => node.status === "failed").length,
      pendingNodes: execution.graph.nodes.filter((node) => node.status === "pending").length,
      canceledNodes: execution.graph.nodes.filter((node) => node.status === "canceled").length,
      retryingNodes: execution.graph.nodes.filter((node) => node.retryCount > 0 && node.status === "pending").length,
    },
  };
}

function findExecution(executionId) {
  const execution = executionStore.get(String(executionId ?? ""));
  if (!execution) return null;
  return execution;
}

function buildExecutionInputSummary(input) {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (typeof input.message === "string" && input.message) return input.message;
  if (typeof input.objective === "string" && input.objective) return input.objective;
  if (typeof input.goal === "string" && input.goal) return input.goal;
  // Check nested objectivePackage (from frontend execute payload)
  if (input.objectivePackage?.goal) return input.objectivePackage.goal;
  // Check conversationContext for user message
  if (Array.isArray(input.conversationContext)) {
    const userMsg = input.conversationContext.find((m) => m.role === "user");
    if (userMsg?.content) return userMsg.content;
  }
  try {
    return JSON.stringify(input).slice(0, 600);
  } catch {
    return String(input).slice(0, 600);
  }
}

function getNodePredecessors(execution, nodeId) {
  return execution.graph.edges
    .filter((edge) => edge.active && edge.target === nodeId)
    .map((edge) => execution.graph.nodes.find((n) => n.id === edge.source))
    .filter(Boolean);
}

function getNodeSuccessors(execution, nodeId) {
  return execution.graph.edges
    .filter((edge) => edge.active && edge.source === nodeId)
    .map((edge) => execution.graph.nodes.find((n) => n.id === edge.target))
    .filter(Boolean);
}

function describeNode(node) {
  const label = node.label || node.id;
  const agent = node.agentId ? ` (agent: ${node.agentId})` : "";
  return `${label}${agent}`;
}

// ── Agent loading & capability validation ──────────────────────────

async function loadAgentRecord(agentId) {
  if (!agentId) return null;
  const cached = agentCache.get(agentId);
  if (cached && Date.now() - cached.ts < 30_000) return cached.agent;
  try {
    const agent = await database.findAgentById(agentId);
    if (agent) agentCache.set(agentId, { agent, ts: Date.now() });
    return agent ?? null;
  } catch {
    return null;
  }
}

function getAgentCapabilities(agent) {
  if (!agent) return [];
  const fromConfig = agent.config?.toolbelt?.equippedToolIds;
  if (Array.isArray(fromConfig) && fromConfig.length > 0) return fromConfig;
  if (Array.isArray(agent.capabilities) && agent.capabilities.length > 0) return agent.capabilities;
  return [];
}

/**
 * Validate that every node with a nodeObjective has an agent with
 * capabilities that are plausibly relevant to the task.
 * Returns { ok, warnings[] } — warnings are advisory, not blocking.
 * Returns { ok: false, errors[] } for hard failures (missing agents).
 */
export async function validateNodeCapabilities(execution) {
  const errors = [];
  const warnings = [];

  for (const node of execution.graph.nodes) {
    if (node.metadata?.isInstruction) continue;
    if (!node.agentId) {
      errors.push({
        nodeId: node.id,
        label: node.label || node.id,
        type: "no_agent",
        message: `Node "${node.label || node.id}" has no agent assigned.`,
      });
      continue;
    }

    const agent = await loadAgentRecord(node.agentId);
    if (!agent) {
      errors.push({
        nodeId: node.id,
        label: node.label || node.id,
        agentId: node.agentId,
        type: "agent_not_found",
        message: `Agent "${node.agentId}" assigned to node "${node.label || node.id}" does not exist.`,
      });
      continue;
    }

    // Store agent record on the node for later use in runNode
    node._agentRecord = agent;

    const capabilities = getAgentCapabilities(agent);
    if (capabilities.length === 0) {
      warnings.push({
        nodeId: node.id,
        label: node.label || node.id,
        agentId: node.agentId,
        agentName: agent.name,
        type: "no_tools",
        message: `Agent "${agent.name}" on node "${node.label || node.id}" has no tools equipped. It will run with base LLM capabilities only.`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function buildNodeMessage(execution, node) {
  const fullObjective = buildExecutionInputSummary(execution.input) || "Execute orchestration node.";
  const nodeObjective = node.nodeObjective || "";

  const predecessors = getNodePredecessors(execution, node.id);
  const successors = getNodeSuccessors(execution, node.id);

  const sections = [];

  sections.push(`== OBJECTIVE ==\n${fullObjective}`);

  if (predecessors.length > 0) {
    const prevLines = predecessors.map((p) => {
      const desc = describeNode(p);
      const task = p.nodeObjective ? `\n  Task: ${p.nodeObjective}` : "";
      const output = p.outputPreview ? `\n  Output: ${p.outputPreview}` : "";
      return `- ${desc}${task}${output}`;
    });
    sections.push(`== PREVIOUS STEPS ==\n${prevLines.join("\n")}`);
  }

  if (nodeObjective && nodeObjective !== fullObjective) {
    sections.push(`== YOUR TASK ==\n${nodeObjective}`);
  }

  const capabilities = getAgentCapabilities(node._agentRecord);
  if (capabilities.length > 0) {
    sections.push(`== YOUR TOOLS ==\nYou have these tools available: ${capabilities.join(", ")}.`);
  }

  if (successors.length > 0) {
    sections.push("Make sure your output is useful for the next agent in the chain.");
  }

  return sections.join("\n\n");
}

function getIncomingActiveEdges(execution, nodeId) {
  return execution.graph.edges.filter((edge) => edge.active && edge.target === nodeId);
}

function getOutgoingActiveEdges(execution, nodeId) {
  return execution.graph.edges.filter((edge) => edge.active && edge.source === nodeId);
}

function isNodeReady(execution, node) {
  if (node.status !== "pending") return false;
  if (execution.startNodeId && !execution.hasStartedAnyNode) {
    return node.id === execution.startNodeId;
  }

  const incoming = getIncomingActiveEdges(execution, node.id);
  if (incoming.length === 0) return true;
  for (const edge of incoming) {
    const source = execution.graph.nodes.find((candidate) => candidate.id === edge.source);
    if (!source) return false;
    if (source.status !== "succeeded") return false;
  }
  return true;
}

async function waitForApprovalDecision(execution, approvalId) {
  const startedAt = Date.now();
  while (true) {
    if (execution.cancelRequested) return "canceled";
    const approval = execution.approvals.find((item) => item.approvalId === approvalId);
    if (!approval) return "missing";
    if (approval.status === "approved" || approval.status === "rejected") {
      return approval.status;
    }
    if (Date.now() - startedAt > 20 * 60 * 1000) {
      approval.status = "rejected";
      approval.reason = approval.reason || "Approval timed out.";
      approval.decidedAt = nowIso();
      approval.action = "reject";
      execution.approvalDecisions.set(approval.edgeId, "rejected");
      emitExecutionEvent(execution, "approval_decided", {
        approvalId: approval.approvalId,
        nodeId: approval.nodeId,
        edgeId: approval.edgeId,
        action: "reject",
        reason: approval.reason,
      });
      markControlChanged(execution);
      return "rejected";
    }
    await sleep(250);
  }
}

async function ensureApprovalsForNode(execution, node) {
  const incoming = getIncomingActiveEdges(execution, node.id).filter(
    (edge) => edge.delegationPolicy?.requiresApproval === true,
  );
  if (incoming.length === 0) return true;

  for (const edge of incoming) {
    const decision = execution.approvalDecisions.get(edge.id);
    if (decision === "approved") continue;
    if (decision === "rejected") return false;

    let approval = execution.approvals.find((item) => item.edgeId === edge.id && item.nodeId === node.id && item.status === "pending");
    if (!approval) {
      approval = {
        approvalId: randomUUID(),
        executionId: execution.executionId,
        nodeId: node.id,
        edgeId: edge.id,
        status: "pending",
        requestedAt: nowIso(),
        decidedAt: "",
        challengeRequired: true,
        reason: "",
        action: "",
      };
      execution.approvals.push(approval);
      emitExecutionEvent(execution, "approval_requested", {
        approvalId: approval.approvalId,
        nodeId: node.id,
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
        challengeRequired: approval.challengeRequired,
      });
      markControlChanged(execution);
    }

    execution.status = "waiting_approval";
    const approvalStatus = await waitForApprovalDecision(execution, approval.approvalId);
    if (approvalStatus !== "approved") {
      return false;
    }
  }

  if (!execution.paused && !execution.cancelRequested) {
    execution.status = "running";
  }
  return true;
}

async function runNode(execution, node) {
  if (execution.cancelRequested) {
    node.status = "canceled";
    node.completedAt = nowIso();
    return;
  }

  const canRun = await ensureApprovalsForNode(execution, node);
  if (!canRun) {
    node.status = "failed";
    node.error = "Approval rejected for delegation edge.";
    node.completedAt = nowIso();
    emitExecutionEvent(execution, "node_failed", {
      nodeId: node.id,
      error: node.error,
      reason: "approval_rejected",
    });
    execution.status = "failed";
    return;
  }

  node.status = "running";
  node.startedAt = nowIso();
  node.error = "";
  emitExecutionEvent(execution, "node_started", {
    nodeId: node.id,
    agentId: node.agentId,
    retryCount: node.retryCount,
  });
  markControlChanged(execution);

  if (node.metadata?.isInstruction) {
    node.status = "succeeded";
    node.completedAt = nowIso();
    node.outputPreview = node.nodeObjective || buildExecutionInputSummary(execution.input) || "Instruction node acknowledged.";
    emitExecutionEvent(execution, "node_succeeded", {
      nodeId: node.id,
      runId: "",
      instruction: true,
      outputPreview: node.outputPreview,
    });
    markControlChanged(execution);
    return;
  }

  if (execution.mode === "dry_run") {
    await sleep(120);
    node.status = "succeeded";
    node.completedAt = nowIso();
    node.outputPreview = "Dry-run node execution complete.";
    emitExecutionEvent(execution, "node_succeeded", {
      nodeId: node.id,
      runId: "",
      dryRun: true,
      outputPreview: node.outputPreview,
    });
    markControlChanged(execution);
    return;
  }

  try {
    const nodeTools = getAgentCapabilities(node._agentRecord);
    const useNative = node._agentRecord && agentRequiresNativeRuntime(node._agentRecord);
    const result = useNative
      ? await runNativeAgentTurn({
          message: buildNodeMessage(execution, node),
          sessionId: execution.sessionId,
          agentId: node.agentId || undefined,
          tools: nodeTools,
          agentName: node._agentRecord?.name,
          agentDescription: node._agentRecord?.description,
          parentRunId: execution.lastRunId || undefined,
        })
      : await runOpenClawTurn({
          message: buildNodeMessage(execution, node),
          sessionId: execution.sessionId,
          agentId: node.agentId || undefined,
          parentRunId: execution.lastRunId || undefined,
          tools: nodeTools,
        });

    node.runId = asString(result.runId) ?? "";
    node.status = "succeeded";
    node.completedAt = nowIso();
    node.outputPreview = asString(result.reply) ?? asString(result.output) ?? "";
    execution.lastRunId = node.runId || execution.lastRunId;
    if (node.runId) execution.runIds.push(node.runId);

    emitExecutionEvent(execution, "node_succeeded", {
      nodeId: node.id,
      runId: node.runId,
      outputPreview: node.outputPreview,
    });
    markControlChanged(execution);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    if (node.retryCount < node.maxRetries) {
      node.retryCount += 1;
      node.status = "pending";
      node.error = messageText;
      emitExecutionEvent(execution, "node_retrying", {
        nodeId: node.id,
        retryCount: node.retryCount,
        error: messageText,
      });
      markControlChanged(execution);
      return;
    }

    node.status = "failed";
    node.error = messageText;
    node.completedAt = nowIso();
    emitExecutionEvent(execution, "node_failed", {
      nodeId: node.id,
      error: messageText,
      retryCount: node.retryCount,
    });
    execution.status = "failed";
    markControlChanged(execution);
  }
}

async function finalizeExecution(execution, status) {
  if (TERMINAL_EXECUTION_STATUSES.has(execution.status) && execution.completedAt) {
    return;
  }
  execution.status = status;
  execution.completedAt = nowIso();
  execution.updatedAt = execution.completedAt;
  emitExecutionEvent(execution, status === "canceled" ? "execution_canceled" : "execution_completed", {
    executionId: execution.executionId,
    orchestrationId: execution.orchestrationId,
    status,
    completedAt: execution.completedAt,
  });
  markControlChanged(execution);
}

async function decomposeObjective(execution) {
  const fullObjective = buildExecutionInputSummary(execution.input);
  if (!fullObjective) return;

  const nodes = execution.graph.nodes.filter((node) => !node.metadata?.isInstruction);
  const edges = execution.graph.edges.filter((e) => e.active);
  const instructionNodes = execution.graph.nodes.filter((node) => node.metadata?.isInstruction);
  for (const node of instructionNodes) {
    node.nodeObjective = fullObjective;
  }
  if (nodes.length === 0) {
    return;
  }
  if (nodes.length < 2) {
    nodes[0].nodeObjective = fullObjective;
    return;
  }

  const nodeList = nodes
    .map((n) => `  - id: ${n.id}, label: ${n.label || n.id}, agent: ${n.agentId || "unassigned"}`)
    .join("\n");
  const edgeList = edges.map((e) => `  - ${e.source} → ${e.target}`).join("\n");

  const plannerPrompt = [
    "You are an orchestration planner. Given a user objective and a DAG of agent nodes, decompose the objective into a specific sub-task for each node.",
    "",
    `OBJECTIVE: ${fullObjective}`,
    "",
    "GRAPH NODES:",
    nodeList,
    "",
    "GRAPH EDGES (execution order):",
    edgeList,
    "",
    "Rules:",
    "- Each node should get a clear, actionable sub-task that contributes to the full objective.",
    "- Respect the graph order: upstream nodes produce inputs that downstream nodes consume.",
    "- Be specific about what each node should produce as output.",
    "- Respond with ONLY a JSON object mapping node id to sub-task string. No markdown, no explanation.",
    '- Example: {"node-1": "Research topic X and produce a structured summary", "node-2": "Create a visual diagram from the research"}',
  ].join("\n");

  try {
    const result = await runOpenClawTurn({
      message: plannerPrompt,
      sessionId: execution.sessionId,
    });

    const reply = (result.reply || "").trim();
    let plan;
    try {
      plan = JSON.parse(reply);
    } catch {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        plan = JSON.parse(jsonMatch[0]);
      }
    }

    if (plan && typeof plan === "object") {
      for (const node of nodes) {
        const objective = plan[node.id];
        if (typeof objective === "string" && objective.trim()) {
          node.nodeObjective = objective.trim();
        }
      }
      emitExecutionEvent(execution, "objective_decomposed", {
        plan,
        nodeCount: nodes.length,
      });
    }
  } catch (error) {
    emitExecutionEvent(execution, "objective_decomposition_skipped", {
      reason: error instanceof Error ? error.message : String(error),
    });
    // Non-fatal: nodes fall back to the full objective
  }
}

async function processExecutionLoop(executionId) {
  const execution = findExecution(executionId);
  if (!execution) return;
  if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) return;

  execution.status = "running";
  execution.startedAt = execution.startedAt || nowIso();
  execution.updatedAt = execution.startedAt;

  // ── Capability validation gate ──
  const capCheck = await validateNodeCapabilities(execution);
  if (!capCheck.ok) {
    for (const err of capCheck.errors) {
      emitExecutionEvent(execution, "capability_error", err);
    }
    await finalizeExecution(execution, "failed");
    execution.error = capCheck.errors.map((e) => e.message).join("; ");
    return;
  }
  if (capCheck.warnings.length > 0) {
    for (const warn of capCheck.warnings) {
      emitExecutionEvent(execution, "capability_warning", warn);
    }
  }

  if (execution.mode !== "dry_run") {
    await decomposeObjective(execution);
  }

  let stagnantTicks = 0;
  while (true) {
    if (execution.cancelRequested) {
      for (const node of execution.graph.nodes) {
        if (node.status === "pending" || node.status === "running") {
          node.status = "canceled";
          node.completedAt = nowIso();
        }
      }
      await finalizeExecution(execution, "canceled");
      return;
    }

    if (execution.paused) {
      execution.status = "paused";
      await sleep(150);
      continue;
    }

    const pendingNodes = execution.graph.nodes.filter((node) => node.status === "pending");
    if (pendingNodes.length === 0) {
      if (execution.graph.nodes.some((node) => node.status === "failed")) {
        await finalizeExecution(execution, "failed");
        return;
      }
      await finalizeExecution(execution, "completed");
      return;
    }

    const readyNode = pendingNodes.find((node) => isNodeReady(execution, node));
    if (!readyNode) {
      stagnantTicks += 1;
      if (stagnantTicks > 120) {
        execution.status = "failed";
        emitExecutionEvent(execution, "execution_completed", {
          executionId: execution.executionId,
          orchestrationId: execution.orchestrationId,
          status: "failed",
          reason: "No runnable nodes (cycle, approvals, or invalid graph state).",
        });
        execution.completedAt = nowIso();
        execution.updatedAt = execution.completedAt;
        return;
      }
      await sleep(200);
      continue;
    }

    execution.hasStartedAnyNode = true;
    stagnantTicks = 0;
    await runNode(execution, readyNode);

    if (execution.status === "failed") {
      await finalizeExecution(execution, "failed");
      return;
    }
  }
}

function queueExecutionStart(executionId) {
  queueMicrotask(() => {
    processExecutionLoop(executionId).catch((error) => {
      const execution = findExecution(executionId);
      if (!execution) return;
      execution.status = "failed";
      execution.completedAt = nowIso();
      execution.updatedAt = execution.completedAt;
      emitExecutionEvent(execution, "execution_completed", {
        executionId,
        orchestrationId: execution.orchestrationId,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

export function createOrchestrationExecution(orchestration, options = {}) {
  const definition = {
    nodes: Array.isArray(orchestration?.nodes) ? orchestration.nodes : [],
    edges: Array.isArray(orchestration?.edges) ? orchestration.edges : [],
  };

  const validation = validateOrchestrationDefinition(definition, { strict: options.strict === true });
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      compiledGraph: validation.compiledGraph,
    };
  }

  const executionId = randomUUID();
  const createdAt = nowIso();

  const execution = {
    executionId,
    orchestrationId: asString(orchestration?.id) ?? "",
    definitionVersion: asString(options.definitionVersion) ?? asString(orchestration?.updatedAt) ?? createdAt,
    mode: options.mode === "dry_run" ? "dry_run" : "live",
    status: "queued",
    input: options.input && typeof options.input === "object" ? options.input : { message: asString(options.input) ?? "" },
    context: options.context && typeof options.context === "object" ? options.context : {},
    mutationPolicy: options.mutationPolicy && typeof options.mutationPolicy === "object" ? options.mutationPolicy : {},
    requestedBy: asString(options.requestedBy) ?? "operator",
    createdAt,
    startedAt: "",
    updatedAt: createdAt,
    completedAt: "",
    startNodeId: asString(options.startNodeId) ?? "",
    sessionId: `orch-${executionId}`,
    hasStartedAnyNode: false,
    paused: false,
    cancelRequested: false,
    lastRunId: "",
    runIds: [],
    runtimeGraphVersion: 1,
    controlRevision: 0,
    timeline: [],
    graph: cloneDefinition(definition),
    approvals: [],
    approvalDecisions: new Map(),
    mutations: [],
  };

  executionStore.set(execution.executionId, execution);
  emitExecutionEvent(execution, "execution_started", {
    executionId: execution.executionId,
    orchestrationId: execution.orchestrationId,
    mode: execution.mode,
    requestedBy: execution.requestedBy,
  });

  if (options.deferStart !== true) {
    queueExecutionStart(execution.executionId);
  }

  return {
    ok: true,
    executionId: execution.executionId,
    orchestrationId: execution.orchestrationId,
    status: execution.status,
    startedAt: execution.startedAt,
    createdAt: execution.createdAt,
  };
}

export function forkOrchestrationExecution(executionId, options = {}) {
  const parent = findExecution(executionId);
  if (!parent) {
    return {
      ok: false,
      error: "Execution not found.",
    };
  }

  const launchMode = asString(options.launchMode) === "dry_run" ? "dry_run" : "live";
  const edits = Array.isArray(options.edits) ? options.edits : [];
  const parentGraphBefore = deepCloneGraph(parent.graph);
  const parentNodeCount = parentGraphBefore.nodes.length;
  const parentEdgeCount = parentGraphBefore.edges.length;

  const baseOrchestration = {
    id: parent.orchestrationId,
    nodes: parentGraphBefore.nodes,
    edges: parentGraphBefore.edges,
    updatedAt: parent.updatedAt || parent.createdAt || nowIso(),
  };

  const created = createOrchestrationExecution(baseOrchestration, {
    mode: launchMode,
    input: {
      forkedFromExecutionId: parent.executionId,
      forkFromSequence: asInteger(options.forkFromSequence, 0),
      parentInput: parent.input,
    },
    context: {
      ...parent.context,
      fork: {
        fromExecutionId: parent.executionId,
        requestedBy: asString(options.requestedBy) ?? "operator",
      },
    },
    mutationPolicy: parent.mutationPolicy,
    requestedBy: asString(options.requestedBy) ?? parent.requestedBy ?? "operator",
    definitionVersion: parent.definitionVersion,
    strict: false,
    deferStart: true,
  });

  if (!created?.ok || !created.executionId) {
    return created;
  }

  const forkExecution = findExecution(created.executionId);
  if (!forkExecution) {
    return {
      ok: false,
      error: "Fork execution could not be initialized.",
    };
  }

  const editFailures = [];
  let editsApplied = 0;
  for (const edit of edits) {
    if (!edit || typeof edit !== "object") continue;
    try {
      applyMutation(forkExecution, edit);
      editsApplied += 1;
    } catch (error) {
      editFailures.push({
        edit,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  queueExecutionStart(forkExecution.executionId);

  return {
    ok: true,
    forkExecutionId: forkExecution.executionId,
    parentExecutionId: parent.executionId,
    diff: {
      editsRequested: edits.length,
      editsApplied,
      editsFailed: editFailures.length,
      nodeDelta: forkExecution.graph.nodes.length - parentNodeCount,
      edgeDelta: forkExecution.graph.edges.length - parentEdgeCount,
      failures: editFailures,
    },
    policyDecision: {
      action: "allow",
      reason: "Fork allowed by orchestration runtime.",
    },
    launchedAt: nowIso(),
    executionStatus: forkExecution.status,
  };
}

export function listOrchestrationExecutions(filters = {}) {
  const statusFilter = asString(filters.status)?.toLowerCase() ?? "";
  const orchestrationIdFilter = asString(filters.orchestrationId) ?? "";
  const limit = clamp(asInteger(filters.limit, 20), 1, 200);
  const cursorOffset = clamp(asInteger(filters.cursor, 0), 0, 1000000);

  const all = [...executionStore.values()]
    .filter((execution) => {
      if (statusFilter && execution.status.toLowerCase() !== statusFilter) return false;
      if (orchestrationIdFilter && execution.orchestrationId !== orchestrationIdFilter) return false;
      return true;
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const items = all.slice(cursorOffset, cursorOffset + limit).map(toPublicExecution);
  const nextCursor = cursorOffset + limit < all.length ? String(cursorOffset + limit) : "";
  return {
    items,
    total: all.length,
    nextCursor,
  };
}

export function getOrchestrationExecution(executionId) {
  const execution = findExecution(executionId);
  if (!execution) return null;
  return toPublicExecution(execution);
}

export function getOrchestrationExecutionGraph(executionId) {
  const execution = findExecution(executionId);
  if (!execution) return null;
  return {
    executionId: execution.executionId,
    orchestrationId: execution.orchestrationId,
    runtimeGraphVersion: execution.runtimeGraphVersion,
    nodes: execution.graph.nodes.map(toPublicNode),
    edges: execution.graph.edges.map(toPublicEdge),
    approvals: execution.approvals.map(toPublicApproval),
  };
}

export function getOrchestrationExecutionTimeline(executionId, options = {}) {
  const execution = findExecution(executionId);
  if (!execution) return null;

  const afterSequence = asInteger(options.cursor, 0);
  const limit = clamp(asInteger(options.limit, 300), 1, 1000);
  const items = execution.timeline.filter((event) => event.sequence > afterSequence).slice(0, limit);
  const latestCursor = execution.timeline.length > 0
    ? execution.timeline[execution.timeline.length - 1].cursor
    : String(afterSequence);

  return {
    executionId: execution.executionId,
    items,
    latestCursor,
  };
}

export function subscribeOrchestrationExecutionEvents(executionId, callback) {
  const execution = findExecution(executionId);
  if (!execution || typeof callback !== "function") {
    return () => {};
  }
  const watchers = executionWatchers.get(execution.executionId) ?? new Set();
  watchers.add(callback);
  executionWatchers.set(execution.executionId, watchers);
  return () => {
    const next = executionWatchers.get(execution.executionId);
    if (!next) return;
    next.delete(callback);
    if (next.size === 0) executionWatchers.delete(execution.executionId);
  };
}

export function pauseOrchestrationExecution(executionId) {
  const execution = findExecution(executionId);
  if (!execution) return null;
  if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) return toPublicExecution(execution);
  execution.paused = true;
  execution.status = "paused";
  emitExecutionEvent(execution, "execution_paused", {
    executionId: execution.executionId,
    orchestrationId: execution.orchestrationId,
  });
  markControlChanged(execution);
  return toPublicExecution(execution);
}

export function resumeOrchestrationExecution(executionId) {
  const execution = findExecution(executionId);
  if (!execution) return null;
  if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) return toPublicExecution(execution);
  execution.paused = false;
  execution.status = execution.approvals.some((approval) => approval.status === "pending")
    ? "waiting_approval"
    : "running";
  emitExecutionEvent(execution, "execution_resumed", {
    executionId: execution.executionId,
    orchestrationId: execution.orchestrationId,
  });
  markControlChanged(execution);
  return toPublicExecution(execution);
}

export function cancelOrchestrationExecution(executionId) {
  const execution = findExecution(executionId);
  if (!execution) return null;
  if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) return toPublicExecution(execution);
  execution.cancelRequested = true;
  markControlChanged(execution);
  return toPublicExecution(execution);
}

function deepCloneGraph(graph) {
  return {
    nodes: graph.nodes.map((node) => ({ ...node, config: { ...node.config }, metadata: { ...node.metadata } })),
    edges: graph.edges.map((edge) => ({ ...edge, delegationPolicy: normalizeDelegationPolicy(edge.delegationPolicy) })),
  };
}

function applyMutation(execution, mutationBody = {}) {
  const op = asString(mutationBody.op) ?? asString(mutationBody.type) ?? "";
  if (!op) {
    throw new Error("Mutation op is required.");
  }

  const beforeGraph = deepCloneGraph(execution.graph);
  const mutationId = randomUUID();
  const timestamp = nowIso();

  if (op === "add_node") {
    const payloadNode = mutationBody.node && typeof mutationBody.node === "object" ? mutationBody.node : {};
    const created = normalizeNode(
      {
        ...payloadNode,
        id: asString(payloadNode.id) ?? `node-${randomUUID().slice(0, 8)}`,
        dynamic: true,
      },
      execution.graph.nodes.length,
    );
    execution.graph.nodes.push(created);
  } else if (op === "spawn_agent") {
    const payloadAgentId = asString(mutationBody.agentId) ?? asString(mutationBody.node?.agentId) ?? "";
    const created = normalizeNode(
      {
        id: asString(mutationBody.node?.id) ?? `spawn-${randomUUID().slice(0, 8)}`,
        label: asString(mutationBody.node?.label) ?? `Spawned ${payloadAgentId || "agent"}`,
        agentId: payloadAgentId,
        dynamic: true,
        spawned: true,
        config: mutationBody.node?.config ?? {},
      },
      execution.graph.nodes.length,
    );
    execution.graph.nodes.push(created);

    const sourceNodeId = asString(mutationBody.sourceNodeId) ?? asString(mutationBody.node?.sourceNodeId) ?? "";
    if (sourceNodeId) {
      execution.graph.edges.push(
        normalizeEdge(
          {
            id: `edge-${randomUUID().slice(0, 8)}`,
            source: sourceNodeId,
            target: created.id,
            delegationPolicy: mutationBody.delegationPolicy,
            active: true,
          },
          execution.graph.edges.length,
        ),
      );
    }
  } else if (op === "remove_node") {
    const nodeId = asString(mutationBody.nodeId) ?? asString(mutationBody.node?.id) ?? "";
    if (!nodeId) throw new Error("remove_node requires nodeId.");
    execution.graph.nodes = execution.graph.nodes.filter((node) => node.id !== nodeId);
    execution.graph.edges = execution.graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
  } else if (op === "rewire_edge") {
    const edgeId = asString(mutationBody.edgeId) ?? "";
    const source = asString(mutationBody.source) ?? "";
    const target = asString(mutationBody.target) ?? "";
    if (!edgeId && (!source || !target)) {
      throw new Error("rewire_edge requires edgeId or source/target.");
    }
    const existing = execution.graph.edges.find((edge) => edge.id === edgeId) || execution.graph.edges.find((edge) => edge.source === source && edge.target === target);
    if (existing) {
      if (source) existing.source = source;
      if (target) existing.target = target;
      if (mutationBody.delegationPolicy !== undefined) {
        existing.delegationPolicy = normalizeDelegationPolicy(mutationBody.delegationPolicy);
      }
      if (mutationBody.active !== undefined) {
        existing.active = mutationBody.active !== false;
      }
    } else {
      execution.graph.edges.push(
        normalizeEdge(
          {
            id: edgeId || `edge-${randomUUID().slice(0, 8)}`,
            source,
            target,
            delegationPolicy: mutationBody.delegationPolicy,
            active: mutationBody.active !== false,
          },
          execution.graph.edges.length,
        ),
      );
    }
  } else if (op === "update_node_config") {
    const nodeId = asString(mutationBody.nodeId) ?? asString(mutationBody.node?.id) ?? "";
    if (!nodeId) throw new Error("update_node_config requires nodeId.");
    const node = execution.graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found.`);
    const nextConfig = mutationBody.config && typeof mutationBody.config === "object"
      ? mutationBody.config
      : (mutationBody.node?.config && typeof mutationBody.node.config === "object" ? mutationBody.node.config : {});
    node.config = { ...node.config, ...nextConfig };
    if (nextConfig.maxRetries !== undefined) {
      node.maxRetries = clamp(asInteger(nextConfig.maxRetries, node.maxRetries), 0, 10);
    }
  } else if (op === "retry_node") {
    const nodeId = asString(mutationBody.nodeId) ?? "";
    const node = execution.graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found.`);
    node.status = "pending";
    node.error = "";
    node.completedAt = "";
  } else if (op === "replay_from_node") {
    const nodeId = asString(mutationBody.nodeId) ?? "";
    const { outgoing } = buildAdjacency(execution.graph.nodes, execution.graph.edges);
    const reset = new Set([nodeId]);
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const edge of outgoing.get(current) ?? []) {
        if (!reset.has(edge.target)) {
          reset.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    for (const node of execution.graph.nodes) {
      if (reset.has(node.id)) {
        node.status = "pending";
        node.error = "";
        node.completedAt = "";
        node.runId = "";
        node.outputPreview = "";
      }
    }
    if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) {
      execution.status = "running";
      execution.completedAt = "";
      queueExecutionStart(execution.executionId);
    }
  } else if (op === "rollback_mutation") {
    const previous = execution.mutations[execution.mutations.length - 1];
    if (!previous?.beforeGraph) {
      throw new Error("No mutation available to roll back.");
    }
    execution.graph = deepCloneGraph(previous.beforeGraph);
  } else {
    throw new Error(`Unsupported mutation op: ${op}`);
  }

  execution.runtimeGraphVersion += 1;
  const mutation = {
    mutationId,
    executionId: execution.executionId,
    op,
    appliedAt: timestamp,
    payload: mutationBody,
    beforeGraph,
  };
  execution.mutations.push(mutation);

  emitExecutionEvent(execution, "mutation_applied", {
    mutationId,
    op,
    runtimeGraphVersion: execution.runtimeGraphVersion,
  });
  markControlChanged(execution);

  return {
    ok: true,
    mutationId,
    appliedAt: timestamp,
    runtimeGraphVersion: execution.runtimeGraphVersion,
  };
}

export function mutateOrchestrationExecution(executionId, body = {}) {
  const execution = findExecution(executionId);
  if (!execution) return null;
  return applyMutation(execution, body);
}

export function submitOrchestrationApprovalDecision(executionId, approvalId, action, reason = "", challengeToken = "") {
  const execution = findExecution(executionId);
  if (!execution) return null;

  const normalizedAction = action === "reject" ? "reject" : "approve";
  const approval = execution.approvals.find((candidate) => candidate.approvalId === approvalId);
  if (!approval) {
    return {
      ok: false,
      error: "Approval not found.",
    };
  }
  if (approval.status !== "pending") {
    return {
      ok: true,
      approval: toPublicApproval(approval),
      executionStatus: execution.status,
    };
  }

  approval.status = normalizedAction === "approve" ? "approved" : "rejected";
  approval.action = normalizedAction;
  approval.reason = asString(reason) ?? "";
  approval.challengeToken = asString(challengeToken) ?? "";
  approval.decidedAt = nowIso();
  execution.approvalDecisions.set(approval.edgeId, approval.status);

  emitExecutionEvent(execution, "approval_decided", {
    approvalId: approval.approvalId,
    nodeId: approval.nodeId,
    edgeId: approval.edgeId,
    action: normalizedAction,
    reason: approval.reason,
  });

  if (execution.status === "waiting_approval" && !execution.paused && !execution.cancelRequested) {
    execution.status = "running";
  }
  markControlChanged(execution);

  return {
    ok: true,
    approval: toPublicApproval(approval),
    executionStatus: execution.status,
  };
}

export function getOrchestrationExecutionSnapshot(executionId) {
  const execution = findExecution(executionId);
  if (!execution) return null;
  return {
    execution: toPublicExecution(execution),
    graph: getOrchestrationExecutionGraph(executionId),
    timeline: [...execution.timeline],
    mutations: execution.mutations.map((mutation) => ({
      mutationId: mutation.mutationId,
      op: mutation.op,
      appliedAt: mutation.appliedAt,
      payload: mutation.payload,
    })),
  };
}

function parseWindowMs(value) {
  if (value == null || value === "") return 3_600_000;
  if (typeof value === "number") return clamp(Math.trunc(value), 60_000, 86_400_000);
  const text = String(value).trim().toLowerCase();
  const suffix = text.slice(-1);
  const numeric = Number.parseInt(text.slice(0, -1), 10);
  if (Number.isFinite(numeric) && suffix === "h") return clamp(numeric * 3_600_000, 60_000, 86_400_000);
  if (Number.isFinite(numeric) && suffix === "m") return clamp(numeric * 60_000, 60_000, 86_400_000);
  const raw = Number.parseInt(text, 10);
  if (Number.isFinite(raw)) return clamp(raw, 60_000, 86_400_000);
  return 3_600_000;
}

export function getOrchestrationObservabilitySummary() {
  const executions = [...executionStore.values()];
  const byStatus = {
    queued: 0,
    running: 0,
    waiting_approval: 0,
    paused: 0,
    completed: 0,
    failed: 0,
    canceled: 0,
  };
  const nodeFailureHotspots = new Map();
  const mutationOps = new Map();
  let approvalsPending = 0;
  for (const execution of executions) {
    if (byStatus[execution.status] !== undefined) {
      byStatus[execution.status] += 1;
    }
    for (const node of execution.graph.nodes) {
      if (node.status === "failed") {
        nodeFailureHotspots.set(node.id, (nodeFailureHotspots.get(node.id) ?? 0) + 1);
      }
    }
    for (const mutation of execution.mutations) {
      mutationOps.set(mutation.op, (mutationOps.get(mutation.op) ?? 0) + 1);
    }
    approvalsPending += execution.approvals.filter((approval) => approval.status === "pending").length;
  }

  const hotspots = [...nodeFailureHotspots.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nodeId, count]) => ({ nodeId, failures: count }));

  const mutationUsage = Object.fromEntries([...mutationOps.entries()].sort((a, b) => b[1] - a[1]));

  return {
    ok: true,
    totalExecutions: executions.length,
    byStatus,
    activeExecutions: byStatus.running + byStatus.waiting_approval + byStatus.paused,
    approvalsPending,
    nodeFailureHotspots: hotspots,
    mutationUsage,
    generatedAt: nowIso(),
  };
}

export function getOrchestrationSloSignals(options = {}) {
  const windowMs = parseWindowMs(options.windowMs ?? options.window);
  const sinceTs = Date.now() - windowMs;
  const executions = [...executionStore.values()].filter((execution) => {
    const createdTs = new Date(execution.createdAt).getTime();
    return Number.isFinite(createdTs) && createdTs >= sinceTs;
  });

  const resolved = executions.filter((execution) => TERMINAL_EXECUTION_STATUSES.has(execution.status));
  const succeeded = resolved.filter((execution) => execution.status === "completed").length;
  const failed = resolved.filter((execution) => execution.status === "failed").length;
  const canceled = resolved.filter((execution) => execution.status === "canceled").length;

  const durations = resolved
    .map((execution) => {
      const start = new Date(execution.startedAt || execution.createdAt).getTime();
      const end = new Date(execution.completedAt || execution.updatedAt).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
      return end - start;
    })
    .filter((value) => Number.isFinite(value));

  durations.sort((a, b) => a - b);
  const avgMs = durations.length > 0
    ? Math.round(durations.reduce((acc, value) => acc + value, 0) / durations.length)
    : null;
  const p95Ms = durations.length > 0
    ? durations[Math.max(0, Math.floor(durations.length * 0.95) - 1)]
    : null;

  const approvalLatency = [];
  for (const execution of executions) {
    for (const approval of execution.approvals) {
      if (!approval.decidedAt) continue;
      const requested = new Date(approval.requestedAt).getTime();
      const decided = new Date(approval.decidedAt).getTime();
      if (Number.isFinite(requested) && Number.isFinite(decided) && decided >= requested) {
        approvalLatency.push(decided - requested);
      }
    }
  }
  approvalLatency.sort((a, b) => a - b);
  const approvalP95 = approvalLatency.length > 0
    ? approvalLatency[Math.max(0, Math.floor(approvalLatency.length * 0.95) - 1)]
    : null;

  return {
    ok: true,
    windowMs,
    since: new Date(sinceTs).toISOString(),
    until: nowIso(),
    executions: {
      total: executions.length,
      resolved: resolved.length,
      succeeded,
      failed,
      canceled,
      successRate: resolved.length > 0 ? succeeded / resolved.length : null,
    },
    latency: {
      avgMs,
      p95Ms,
      sampleSize: durations.length,
    },
    approvals: {
      p95DecisionMs: approvalP95,
      sampleSize: approvalLatency.length,
    },
    signals: [
      {
        name: "Execution Success",
        value: resolved.length > 0 ? succeeded / resolved.length : 1,
        target: 0.98,
        status: resolved.length > 0 && succeeded / resolved.length >= 0.98 ? "met" : "miss",
      },
      {
        name: "Execution p95 Latency",
        value: p95Ms,
        target: 30_000,
        status: p95Ms != null && p95Ms <= 30_000 ? "met" : "miss",
      },
      {
        name: "Approval p95 Latency",
        value: approvalP95,
        target: 60_000,
        status: approvalP95 != null && approvalP95 <= 60_000 ? "met" : "miss",
      },
    ],
  };
}

export function listExecutionStoreItems() {
  return [...executionStore.values()].map(toPublicExecution);
}
