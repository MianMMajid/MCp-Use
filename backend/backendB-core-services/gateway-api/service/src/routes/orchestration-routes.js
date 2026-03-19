import { database } from "../state.js";
import { requireApiKeyResponse, authContextStorage } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { hasValidStepUp } from "../core/step-up-auth.js";
import { resolveVerifiedTenantScope } from "../core/tenant-claim-resolver.js";
import {
  validateOrchestrationDefinition,
  createOrchestrationExecution,
  listOrchestrationExecutions,
  getOrchestrationExecution,
  getOrchestrationExecutionGraph,
  getOrchestrationExecutionTimeline,
  subscribeOrchestrationExecutionEvents,
  pauseOrchestrationExecution,
  resumeOrchestrationExecution,
  cancelOrchestrationExecution,
  mutateOrchestrationExecution,
  submitOrchestrationApprovalDecision,
  getOrchestrationExecutionSnapshot,
} from "../core/orchestration-runtime.js";

const executionPersistenceWatchers = new Map();

// ── In-memory caches (DB-backed, loaded on demand) ────────────────────────
const conversations = new Map();
const objectivePackages = new Map();
const executionTasks = new Map();
const executionReassignments = new Map();
let reassignCounter = 0;

// ── DB persistence helpers for conversations & tasks ──────────────────────

async function loadConversationFromDb(orchestrationId) {
  try {
    const result = await database.pool.query(
      `SELECT id, role, text, created_at FROM orchestration_conversations WHERE orchestration_id = $1 ORDER BY created_at`,
      [orchestrationId],
    );
    return result.rows.map((row) => ({ id: row.id, role: row.role, text: row.text, createdAt: row.created_at }));
  } catch { return null; }
}

async function persistConversationMessage(orchestrationId, message) {
  try {
    await database.pool.query(
      `INSERT INTO orchestration_conversations (id, orchestration_id, role, text, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [message.id, orchestrationId, message.role, message.text, message.createdAt],
    );
  } catch { /* non-fatal */ }
}

async function loadObjectivePackageFromDb(orchestrationId) {
  try {
    const result = await database.pool.query(
      `SELECT * FROM orchestration_objective_packages WHERE orchestration_id = $1 LIMIT 1`,
      [orchestrationId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      goal: row.goal,
      successCriteria: row.success_criteria,
      runtimeLimitMinutes: Number(row.runtime_limit_minutes),
      budgetUsd: Number(row.budget_usd),
      riskCeiling: row.risk_ceiling,
      contextUrls: JSON.parse(row.context_urls_json || "[]"),
      outputContract: row.output_contract,
      escalationPolicy: row.escalation_policy,
    };
  } catch { return null; }
}

async function persistObjectivePackage(orchestrationId, pkg) {
  try {
    await database.pool.query(
      `INSERT INTO orchestration_objective_packages
         (orchestration_id, goal, success_criteria, runtime_limit_minutes, budget_usd, risk_ceiling, context_urls_json, output_contract, escalation_policy, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (orchestration_id) DO UPDATE SET
         goal = EXCLUDED.goal, success_criteria = EXCLUDED.success_criteria,
         runtime_limit_minutes = EXCLUDED.runtime_limit_minutes, budget_usd = EXCLUDED.budget_usd,
         risk_ceiling = EXCLUDED.risk_ceiling, context_urls_json = EXCLUDED.context_urls_json,
         output_contract = EXCLUDED.output_contract, escalation_policy = EXCLUDED.escalation_policy,
         updated_at = EXCLUDED.updated_at`,
      [orchestrationId, pkg.goal, pkg.successCriteria, pkg.runtimeLimitMinutes, pkg.budgetUsd,
       pkg.riskCeiling, JSON.stringify(pkg.contextUrls || []), pkg.outputContract, pkg.escalationPolicy,
       new Date().toISOString()],
    );
  } catch { /* non-fatal */ }
}

async function loadExecutionTasksFromDb(executionId) {
  try {
    const result = await database.pool.query(
      `SELECT * FROM orchestration_execution_tasks WHERE execution_id = $1 ORDER BY created_at`,
      [executionId],
    );
    if (result.rows.length === 0) return null;
    return result.rows.map((row) => ({
      id: row.task_id, taskId: row.task_id, executionId: row.execution_id, nodeId: row.node_id,
      title: row.title, status: row.status, ownerRole: row.owner_role, ownerAgentId: row.owner_agent_id,
      dueAt: row.due_at, createdAt: row.created_at, updatedAt: row.updated_at,
      history: JSON.parse(row.history_json || "[]"),
    }));
  } catch { return null; }
}

async function persistExecutionTasks(executionId, tasks) {
  try {
    for (const task of tasks) {
      await database.pool.query(
        `INSERT INTO orchestration_execution_tasks
           (task_id, execution_id, node_id, title, status, owner_role, owner_agent_id, due_at, created_at, updated_at, history_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (task_id) DO UPDATE SET
           status = EXCLUDED.status, owner_role = EXCLUDED.owner_role, owner_agent_id = EXCLUDED.owner_agent_id,
           due_at = EXCLUDED.due_at, updated_at = EXCLUDED.updated_at, history_json = EXCLUDED.history_json`,
        [task.taskId || task.id, executionId, task.nodeId, task.title, task.status, task.ownerRole,
         task.ownerAgentId, task.dueAt, task.createdAt, task.updatedAt, JSON.stringify(task.history || [])],
      );
    }
  } catch { /* non-fatal */ }
}

async function persistReassignment(executionId, reassignment) {
  try {
    await database.pool.query(
      `INSERT INTO orchestration_execution_reassignments
         (reassignment_id, execution_id, task_id, from_role, from_agent_id, target_role, target_agent_id,
          due_at, repeat_interval_minutes, max_repeats, status, created_at, warnings_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT DO NOTHING`,
      [reassignment.id, executionId, reassignment.taskId, reassignment.fromRole, reassignment.fromAgentId,
       reassignment.targetRole, reassignment.targetAgentId, reassignment.dueAt,
       reassignment.repeatIntervalMinutes || 0, reassignment.maxRepeats || 1,
       reassignment.status || "pending", reassignment.createdAt, JSON.stringify(reassignment.warnings || [])],
    );
  } catch { /* non-fatal */ }
}

const BUILTIN_TEMPLATES = [
  {
    id: "tpl-manager-coding-3",
    name: "Manager + 3 Coding Workers",
    description: "Manager agent delegates implementation, review, and test tasks to coding workers.",
    suggestedName: "Coding Delivery Loop",
    suggestedDescription: "Continuous planning and delivery with code-focused workers.",
    roles: [
      { roleId: "manager", displayName: "Manager", defaultAgentId: "agent-1" },
      { roleId: "coder-1", displayName: "Coding Worker 1", defaultAgentId: "agent-2" },
      { roleId: "coder-2", displayName: "Coding Worker 2", defaultAgentId: "agent-3" },
      { roleId: "coder-3", displayName: "Coding Worker 3", defaultAgentId: "agent-4" },
    ],
    edges: [
      ["manager", "coder-1"],
      ["manager", "coder-2"],
      ["manager", "coder-3"],
    ],
  },
  {
    id: "tpl-manager-email-3",
    name: "Manager + 3 Email Workers",
    description: "Manager coordinates drafting, QA, and follow-up email workers.",
    suggestedName: "Email Operations Loop",
    suggestedDescription: "Repeated outbound and response triage orchestration.",
    roles: [
      { roleId: "manager", displayName: "Manager", defaultAgentId: "agent-1" },
      { roleId: "email-draft", displayName: "Email Drafter", defaultAgentId: "agent-2" },
      { roleId: "email-qa", displayName: "Email QA", defaultAgentId: "agent-3" },
      { roleId: "email-followup", displayName: "Follow-up Worker", defaultAgentId: "agent-4" },
    ],
    edges: [
      ["manager", "email-draft"],
      ["manager", "email-qa"],
      ["manager", "email-followup"],
    ],
  },
  {
    id: "tpl-security-triage",
    name: "Security Triage Manager Pattern",
    description: "Security triage manager delegates policy, comms, and remediation workers.",
    suggestedName: "Security Triage Loop",
    suggestedDescription: "Persistent triage loop for security incidents and guardrails.",
    roles: [
      { roleId: "triage-manager", displayName: "Triage Manager", defaultAgentId: "agent-1" },
      { roleId: "policy-worker", displayName: "Policy Worker", defaultAgentId: "agent-2" },
      { roleId: "comms-worker", displayName: "Comms Worker", defaultAgentId: "agent-3" },
      { roleId: "remediation-worker", displayName: "Remediation Worker", defaultAgentId: "agent-4" },
    ],
    edges: [
      ["triage-manager", "policy-worker"],
      ["triage-manager", "comms-worker"],
      ["triage-manager", "remediation-worker"],
    ],
  },
];

function parseBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  return text === "1" || text === "true" || text === "yes";
}

function toSseEvent(name, payload) {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function buildExecutionInput(body) {
  if (body.input && typeof body.input === "object") return body.input;
  if (asString(body.message)) return { message: asString(body.message) };
  if (asString(body.objective)) return { objective: asString(body.objective) };
  // Support objectivePackage.goal from frontend
  if (body.objectivePackage?.goal) return { message: body.objectivePackage.goal, objectivePackage: body.objectivePackage };
  // Support conversationContext with user message
  if (Array.isArray(body.conversationContext)) {
    const userMsg = body.conversationContext.find((m) => m.role === "user");
    if (userMsg?.content) return { message: userMsg.content, conversationContext: body.conversationContext };
  }
  return body.input ?? {};
}

function isHighRiskMutationOp(op) {
  return [
    "spawn_agent",
    "rewire_edge",
    "remove_node",
    "replay_from_node",
  ].includes(String(op ?? ""));
}

async function enforceSensitiveOperationGate(c, operation) {
  const authContext = authContextStorage.getStore();
  const userId = asString(authContext?.userId) ?? "";
  if (!userId) return null;

  // Finding 10: Use verified tenant scope instead of raw headers
  const scope = await resolveVerifiedTenantScope({
    tenantId: asString(c.req.header("x-tenant-id")) ?? "",
    orgId: asString(c.req.header("x-org-id")) ?? "",
    tenantClaimSignature: asString(c.req.header("x-maple-tenant-claim")) ?? "",
  });
  if (!scope.verified && scope.tenantId) {
    return c.json({
      ok: false,
      error: "Unverified tenant scope rejected for sensitive operation",
      operation,
    }, 403);
  }
  const stepUp = await hasValidStepUp(userId, { tenantId: scope.tenantId, orgId: scope.orgId, database });
  if (stepUp?.valid === true) return null;

  c.status(403);
  return c.json({
    ok: false,
    error: "Step-up verification required",
    operation,
    stepUpStatus: stepUp,
    replacement: "/api/operations/orchestrations/step-up/challenge",
  });
}

function parsePayload(raw, fallback) {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function toDbExecutionPublic(row, metrics = {}) {
  const succeededNodes = Number(metrics.succeededNodes ?? 0);
  const failedNodes = Number(metrics.failedNodes ?? 0);
  const pendingNodes = Number(metrics.pendingNodes ?? 0);
  const canceledNodes = Number(metrics.canceledNodes ?? 0);
  const retryingNodes = Number(metrics.retryingNodes ?? 0);
  const nodeCount = Number(metrics.nodeCount ?? succeededNodes + failedNodes + pendingNodes + canceledNodes + retryingNodes);
  const edgeCount = Number(metrics.edgeCount ?? 0);

  return {
    executionId: row.id,
    orchestrationId: row.orchestration_id,
    definitionVersion: row.version_id ?? "",
    status: row.status,
    mode: row.mode,
    input: parsePayload(row.input_json, {}),
    context: parsePayload(row.context_json, {}),
    requestedBy: row.requested_by,
    createdAt: row.created_at,
    startedAt: row.started_at ?? "",
    updatedAt: row.updated_at ?? row.created_at,
    completedAt: row.completed_at ?? "",
    runtimeGraphVersion: Number(metrics.runtimeGraphVersion ?? 1),
    nodeCount,
    edgeCount,
    approvals: [],
    metrics: {
      succeededNodes,
      failedNodes,
      pendingNodes,
      canceledNodes,
      retryingNodes,
    },
  };
}

async function loadExecutionMetricsForIds(executionIds) {
  if (!database?.pool || !Array.isArray(executionIds) || executionIds.length === 0) {
    return new Map();
  }
  const result = await database.pool.query(
    `SELECT
       execution_id,
       COUNT(*)::int AS node_count,
       COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded_nodes,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_nodes,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_nodes,
       COUNT(*) FILTER (WHERE status = 'canceled')::int AS canceled_nodes,
       COUNT(*) FILTER (WHERE retry_count > 0 AND status = 'pending')::int AS retrying_nodes
     FROM orchestration_execution_nodes
     WHERE execution_id = ANY($1::text[])
     GROUP BY execution_id`,
    [executionIds],
  );
  const edgeResult = await database.pool.query(
    `SELECT execution_id, COUNT(*)::int AS edge_count
       FROM orchestration_execution_edges
      WHERE execution_id = ANY($1::text[])
      GROUP BY execution_id`,
    [executionIds],
  );

  const metrics = new Map();
  for (const row of result.rows) {
    metrics.set(row.execution_id, {
      nodeCount: Number(row.node_count ?? 0),
      succeededNodes: Number(row.succeeded_nodes ?? 0),
      failedNodes: Number(row.failed_nodes ?? 0),
      pendingNodes: Number(row.pending_nodes ?? 0),
      canceledNodes: Number(row.canceled_nodes ?? 0),
      retryingNodes: Number(row.retrying_nodes ?? 0),
    });
  }
  for (const row of edgeResult.rows) {
    const current = metrics.get(row.execution_id) ?? {};
    metrics.set(row.execution_id, {
      ...current,
      edgeCount: Number(row.edge_count ?? 0),
    });
  }
  return metrics;
}

async function readExecutionListFromDb(filters = {}) {
  if (!database?.pool) return null;
  const where = [];
  const params = [];
  let idx = 1;
  if (filters.status) {
    where.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.orchestrationId) {
    where.push(`orchestration_id = $${idx++}`);
    params.push(filters.orchestrationId);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const offset = parseBoundedInteger(filters.cursor, 0, 0, 1_000_000);
  const limit = parseBoundedInteger(filters.limit, 20, 1, 200);

  const countResult = await database.pool.query(
    `SELECT COUNT(*)::int AS total FROM orchestration_executions ${clause}`,
    params,
  );

  params.push(limit, offset);
  const rowsResult = await database.pool.query(
    `SELECT *
       FROM orchestration_executions
       ${clause}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}`,
    params,
  );

  const executionIds = rowsResult.rows.map((row) => row.id);
  const metricMap = await loadExecutionMetricsForIds(executionIds);
  const items = rowsResult.rows.map((row) => toDbExecutionPublic(row, metricMap.get(row.id) ?? {}));
  const total = Number(countResult.rows[0]?.total ?? items.length);
  const nextCursor = offset + items.length < total ? String(offset + items.length) : "";

  return {
    items,
    total,
    nextCursor,
  };
}

async function readExecutionFromDb(executionId) {
  if (!database?.pool) return null;
  const rowResult = await database.pool.query(
    `SELECT * FROM orchestration_executions WHERE id = $1 LIMIT 1`,
    [executionId],
  );
  if (rowResult.rows.length === 0) return null;
  const metricMap = await loadExecutionMetricsForIds([executionId]);
  return toDbExecutionPublic(rowResult.rows[0], metricMap.get(executionId) ?? {});
}

async function readExecutionGraphFromDb(executionId) {
  if (!database?.pool) return null;
  const [nodesResult, edgesResult, versionResult] = await Promise.all([
    database.pool.query(
      `SELECT node_id, status, retry_count, started_at, completed_at, error_text, output_preview, cost_json
         FROM orchestration_execution_nodes
        WHERE execution_id = $1
        ORDER BY node_id ASC`,
      [executionId],
    ),
    database.pool.query(
      `SELECT edge_id, source_node_id, target_node_id, active, delegation_policy_json
         FROM orchestration_execution_edges
        WHERE execution_id = $1
        ORDER BY edge_id ASC`,
      [executionId],
    ),
    database.pool.query(
      `SELECT COALESCE(MAX(runtime_graph_version), 1) AS runtime_graph_version
         FROM orchestration_mutations
        WHERE execution_id = $1`,
      [executionId],
    ),
  ]);

  if (nodesResult.rows.length === 0 && edgesResult.rows.length === 0) {
    return null;
  }

  return {
    executionId,
    runtimeGraphVersion: Number(versionResult.rows[0]?.runtime_graph_version ?? 1),
    nodes: nodesResult.rows.map((row) => {
      const metadata = parsePayload(row.cost_json, {});
      return {
        id: row.node_id,
        label: metadata.label ?? row.node_id,
        agentId: metadata.agentId ?? "",
        role: metadata.role ?? (row.node_id === "instruction-root" ? "instruction" : ""),
        status: row.status,
        retryCount: Number(row.retry_count ?? 0),
        startedAt: row.started_at ?? "",
        completedAt: row.completed_at ?? "",
        error: row.error_text ?? "",
        outputPreview: row.output_preview ?? "",
        nodeObjective: metadata.nodeObjective ?? "",
        isInstruction: metadata.isInstruction === true || row.node_id === "instruction-root",
      };
    }),
    edges: edgesResult.rows.map((row) => ({
      id: row.edge_id,
      source: row.source_node_id,
      target: row.target_node_id,
      active: row.active !== false,
      delegationPolicy: parsePayload(row.delegation_policy_json, {}),
    })),
    approvals: [],
  };
}

async function readExecutionTimelineFromDb(executionId, cursor = "0", limit = 300) {
  if (!database?.pool) return null;
  const afterSequence = parseBoundedInteger(cursor, 0, 0, 2_000_000_000);
  const boundedLimit = parseBoundedInteger(limit, 300, 1, 1000);
  const result = await database.pool.query(
    `SELECT id, sequence, event_type, payload_json, event_ts
       FROM orchestration_timeline_events
      WHERE execution_id = $1
        AND sequence > $2
      ORDER BY sequence ASC
      LIMIT $3`,
    [executionId, afterSequence, boundedLimit],
  );
  if (result.rows.length === 0) {
    const latest = await database.pool.query(
      `SELECT COALESCE(MAX(sequence), 0) AS max_sequence
         FROM orchestration_timeline_events
        WHERE execution_id = $1`,
      [executionId],
    );
    const maxSequence = Number(latest.rows[0]?.max_sequence ?? afterSequence);
    if (maxSequence === 0) {
      return null;
    }
    return {
      executionId,
      items: [],
      latestCursor: String(maxSequence),
    };
  }

  const items = result.rows.map((row) => ({
    id: row.id,
    sequence: Number(row.sequence ?? 0),
    cursor: String(row.sequence ?? "0"),
    executionId,
    eventType: row.event_type,
    timestamp: row.event_ts,
    payload: parsePayload(row.payload_json, {}),
  }));
  return {
    executionId,
    items,
    latestCursor: String(items[items.length - 1]?.sequence ?? afterSequence),
  };
}

async function readExecutionMutationsFromDb(executionId) {
  if (!database?.pool) return [];
  const result = await database.pool.query(
    `SELECT id, op, payload_json, applied_at
       FROM orchestration_mutations
      WHERE execution_id = $1
      ORDER BY applied_at ASC`,
    [executionId],
  );
  return result.rows.map((row) => ({
    mutationId: row.id,
    op: row.op,
    payload: parsePayload(row.payload_json, {}),
    appliedAt: row.applied_at,
  }));
}

async function persistExecutionSnapshot(executionId) {
  if (!database?.pool) return;
  const snapshot = getOrchestrationExecutionSnapshot(executionId);
  if (!snapshot?.execution) return;

  const execution = snapshot.execution;
  const graph = snapshot.graph ?? { nodes: [], edges: [] };
  const timeline = Array.isArray(snapshot.timeline) ? snapshot.timeline : [];
  const mutations = Array.isArray(snapshot.mutations) ? snapshot.mutations : [];
  const runLineage = timeline
    .filter((event) => event?.payload?.runId)
    .map((event) => ({
      runId: event.payload.runId,
      nodeId: event.payload.nodeId ?? "",
      eventType: event.eventType ?? "",
      timestamp: event.timestamp ?? "",
    }));

  if (typeof database.updateOrchestrationExecutionRecord === "function") {
    await database.updateOrchestrationExecutionRecord(execution.executionId, {
      status: execution.status,
      startedAt: execution.startedAt || null,
      completedAt: execution.completedAt || null,
      runLineage,
    });
  }

  await database.pool.query(`DELETE FROM orchestration_execution_nodes WHERE execution_id = $1`, [execution.executionId]);
  await database.pool.query(`DELETE FROM orchestration_execution_edges WHERE execution_id = $1`, [execution.executionId]);

  const nodes = graph.nodes ?? [];
  if (nodes.length > 0) {
    const ids = [], execIds = [], nodeIds = [], statuses = [], retryCounts = [];
    const startedAts = [], completedAts = [], errorTexts = [], outputPreviews = [], nodeMetadata = [];
    for (const node of nodes) {
      ids.push(`${execution.executionId}:${node.id}`);
      execIds.push(execution.executionId);
      nodeIds.push(node.id);
      statuses.push(node.status ?? "pending");
      retryCounts.push(Number(node.retryCount ?? 0));
      startedAts.push(node.startedAt || null);
      completedAts.push(node.completedAt || null);
      errorTexts.push(node.error ?? "");
      outputPreviews.push(node.outputPreview ?? "");
      nodeMetadata.push(JSON.stringify({
        label: node.label ?? node.id,
        agentId: node.agentId ?? "",
        role: node.role ?? "",
        nodeObjective: node.nodeObjective ?? "",
        isInstruction: node.isInstruction === true || node.metadata?.isInstruction === true,
      }));
    }
    await database.pool.query(
      `INSERT INTO orchestration_execution_nodes
         (id, execution_id, node_id, status, retry_count, started_at, completed_at, error_text, output_preview, cost_json)
       SELECT
         t.id,
         t.execution_id,
         t.node_id,
         t.status,
         t.retry_count,
         t.started_at,
         t.completed_at,
         t.error_text,
         t.output_preview,
         t.cost_json
       FROM UNNEST(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::int[],
         $6::timestamptz[], $7::timestamptz[], $8::text[], $9::text[], $10::text[]
       ) AS t(id, execution_id, node_id, status, retry_count, started_at, completed_at, error_text, output_preview, cost_json)
       ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status,
           retry_count = EXCLUDED.retry_count,
           started_at = EXCLUDED.started_at,
           completed_at = EXCLUDED.completed_at,
           error_text = EXCLUDED.error_text,
           output_preview = EXCLUDED.output_preview,
           cost_json = EXCLUDED.cost_json`,
      [ids, execIds, nodeIds, statuses, retryCounts, startedAts, completedAts, errorTexts, outputPreviews, nodeMetadata],
    );
  }

  const edges = graph.edges ?? [];
  if (edges.length > 0) {
    const ids = [], execIds = [], edgeIds = [], sources = [], targets = [];
    const actives = [], policies = [];
    for (const edge of edges) {
      ids.push(`${execution.executionId}:${edge.id}`);
      execIds.push(execution.executionId);
      edgeIds.push(edge.id);
      sources.push(edge.source ?? "");
      targets.push(edge.target ?? "");
      actives.push(edge.active !== false);
      policies.push(JSON.stringify(edge.delegationPolicy ?? {}));
    }
    await database.pool.query(
      `INSERT INTO orchestration_execution_edges
         (id, execution_id, edge_id, source_node_id, target_node_id, active, delegation_policy_json, rewired_at)
       SELECT unnest($1::text[]), unnest($2::text[]), unnest($3::text[]),
              unnest($4::text[]), unnest($5::text[]), unnest($6::bool[]),
              unnest($7::jsonb[]), NULL
       ON CONFLICT (id) DO UPDATE
       SET source_node_id = EXCLUDED.source_node_id,
           target_node_id = EXCLUDED.target_node_id,
           active = EXCLUDED.active,
           delegation_policy_json = EXCLUDED.delegation_policy_json`,
      [ids, execIds, edgeIds, sources, targets, actives, policies],
    );
  }

  for (const mutation of mutations) {
    await database.pool.query(
      `INSERT INTO orchestration_mutations
         (id, execution_id, op, payload_json, runtime_graph_version, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET op = EXCLUDED.op,
           payload_json = EXCLUDED.payload_json,
           runtime_graph_version = EXCLUDED.runtime_graph_version,
           applied_at = EXCLUDED.applied_at`,
      [
        mutation.mutationId,
        execution.executionId,
        mutation.op ?? "mutation",
        JSON.stringify(mutation.payload ?? {}),
        Number(execution.runtimeGraphVersion ?? 1),
        mutation.appliedAt ?? execution.updatedAt ?? execution.createdAt,
      ],
    );
  }

  for (const event of timeline) {
    await database.pool.query(
      `INSERT INTO orchestration_timeline_events
         (id, execution_id, orchestration_id, sequence, event_type, payload_json, event_ts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id,
        execution.executionId,
        execution.orchestrationId,
        Number(event.sequence ?? 0),
        event.eventType ?? "event",
        JSON.stringify(event.payload ?? {}),
        event.timestamp ?? execution.updatedAt ?? execution.createdAt,
      ],
    );
  }
}

export async function ensureExecutionPersistenceWatch(executionId) {
  if (!executionId || executionPersistenceWatchers.has(executionId)) return;
  let running = false;
  let rerun = false;
  const flush = async () => {
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      await persistExecutionSnapshot(executionId);
    } catch (error) {
      mapleLog("warn", "orchestration.execution_snapshot_persist_failed", {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        queueMicrotask(flush);
      }
    }
  };

  const unsubscribe = subscribeOrchestrationExecutionEvents(executionId, () => {
    flush().catch(() => {});
  });
  executionPersistenceWatchers.set(executionId, unsubscribe);
  await flush();
}

async function syncExecutionRecord(execution) {
  if (!execution) return;
  try {
    await persistExecutionSnapshot(execution.executionId);
  } catch (error) {
    mapleLog("warn", "orchestration.execution_record_sync_failed", {
      executionId: execution.executionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function findOrchestrationVersion(orchestrationId, definitionVersion) {
  if (!definitionVersion || typeof database.findOrchestrationVersion !== "function") {
    return null;
  }
  try {
    const version = await database.findOrchestrationVersion(orchestrationId, definitionVersion);
    return version ?? null;
  } catch {
    return null;
  }
}

async function findLatestOrchestrationVersion(orchestrationId) {
  if (typeof database.findLatestOrchestrationVersion !== "function") {
    return null;
  }
  try {
    const version = await database.findLatestOrchestrationVersion(orchestrationId);
    return version ?? null;
  } catch {
    return null;
  }
}

async function resolveDefinitionForRuntime(orchestration, definitionVersion) {
  const currentNodes = Array.isArray(orchestration?.nodes) ? orchestration.nodes : [];
  const currentEdges = Array.isArray(orchestration?.edges) ? orchestration.edges : [];
  const hasCurrentDefinition = currentNodes.length > 0 || currentEdges.length > 0;
  if (!definitionVersion && hasCurrentDefinition) {
    // Use the inline definition but still resolve the version record so
    // execution records reference the correct version row.
    let versionRecord = null;
    try {
      versionRecord = await findLatestOrchestrationVersion(orchestration.id);
    } catch { /* version lookup is best-effort */ }
    return {
      orchestration: {
        ...orchestration,
        nodes: currentNodes,
        edges: currentEdges,
      },
      versionRecord,
      resolvedDefinitionVersion: asString(orchestration.updatedAt) ?? "",
    };
  }
  const versionRecord =
    (await findOrchestrationVersion(orchestration.id, definitionVersion)) ??
    (await findLatestOrchestrationVersion(orchestration.id));
  if (!versionRecord) {
    return {
      orchestration,
      versionRecord: null,
      resolvedDefinitionVersion: asString(definitionVersion) ?? asString(orchestration.updatedAt) ?? "",
    };
  }

  const definition = versionRecord.definition ?? {};
  return {
    orchestration: {
      ...orchestration,
      nodes: Array.isArray(definition.nodes) ? definition.nodes : [],
      edges: Array.isArray(definition.edges) ? definition.edges : [],
    },
    versionRecord,
    resolvedDefinitionVersion: asString(versionRecord.version) ?? asString(orchestration.updatedAt) ?? "",
  };
}

async function findOrchestrationOr404(c, id) {
  const orchestration = await database.findOrchestrationById(id);
  if (!orchestration) {
    c.status(404);
    return c.json({ ok: false, error: "Orchestration not found" });
  }
  return orchestration;
}

export function registerOrchestrationRoutes(app) {
  // POST /api/orchestrations — create orchestration
  app.post("/api/orchestrations", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const body = await readJsonBody(c);
    const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
    // Always use auth context userId — never accept arbitrary ownerId from body
    const ownerId = authContext?.userId ?? null;

    try {
      const orchestration = await database.createOrchestration({
        name: asString(body.name) ?? "Untitled Orchestration",
        description: asString(body.description) ?? "",
        ownerId,
      });
      mapleLog("info", "orchestration.created", {
        orchestrationId: orchestration.id,
        name: orchestration.name,
      });
      return c.json(orchestration, 201);
    } catch (err) {
      mapleLog("error", "orchestration.create_failed", { error: err.message });
      return c.json(
        { error: "Failed to create orchestration", details: err.message },
        500,
      );
    }
  });

  // GET /api/orchestrations — list orchestrations with filters
  app.get("/api/orchestrations", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
    const filters = {};
    const status = c.req.query("status");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    // Enforce ownership scoping
    if (authContext?.userId) filters.ownerId = authContext.userId;
    if (status) filters.status = status;
    if (limit) filters.limit = Number(limit);
    if (offset) filters.offset = Number(offset);

    try {
      const orchestrations = await database.listOrchestrations(filters);
      return c.json({ items: orchestrations });
    } catch (err) {
      mapleLog("error", "orchestration.list_failed", { error: err.message });
      return c.json(
        { error: "Failed to list orchestrations", details: err.message },
        500,
      );
    }
  });

  // ── Runtime execution APIs ───────────────────────────────────────────────

  app.get("/api/orchestrations/executions", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const filters = {
      status: asString(c.req.query("status")) ?? "",
      orchestrationId: asString(c.req.query("orchestrationId")) ?? "",
      cursor: asString(c.req.query("cursor")) ?? "0",
      limit: parseBoundedInteger(c.req.query("limit"), 20, 1, 200),
    };
    const result = (await readExecutionListFromDb(filters)) ?? listOrchestrationExecutions(filters);

    return c.json({
      ok: true,
      items: result.items,
      nextCursor: result.nextCursor,
      total: result.total,
    });
  });

  // Static /approvals route MUST be registered before the dynamic :executionId
  // route, otherwise "approvals" matches as an executionId and returns 404.
  app.get("/api/orchestrations/executions/approvals", async (c) => {
    const url = new URL(c.req.url);
    url.pathname = "/api/operations/orchestrations/approvals";
    return c.redirect(url.toString(), 307);
  });

  app.get("/api/orchestrations/executions/:executionId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const execution = (await readExecutionFromDb(executionId)) ?? getOrchestrationExecution(executionId);
    if (!execution) {
      return c.json({ ok: false, error: "Execution not found." }, 404);
    }
    return c.json({ ok: true, execution });
  });

  app.get("/api/orchestrations/executions/:executionId/graph", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    // Prefer in-memory graph (has full data including attachments) over DB read
    // (DB does not persist attachments column yet). Fall back to DB for historical executions.
    const graph = getOrchestrationExecutionGraph(executionId) ?? (await readExecutionGraphFromDb(executionId));
    if (!graph) {
      return c.json({ ok: false, error: "Execution not found." }, 404);
    }
    return c.json({ ok: true, ...graph });
  });

  app.get("/api/orchestrations/executions/:executionId/timeline", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const cursor = asString(c.req.query("cursor")) ?? "0";
    const limit = parseBoundedInteger(c.req.query("limit"), 300, 1, 1000);
    const execution = (await readExecutionFromDb(executionId)) ?? getOrchestrationExecution(executionId);
    const timeline = (await readExecutionTimelineFromDb(executionId, cursor, limit))
      ?? getOrchestrationExecutionTimeline(executionId, { cursor, limit });
    if (!timeline && !execution) {
      return c.json({ ok: false, error: "Execution not found." }, 404);
    }
    const items = timeline?.items ?? [];
    const latestCursor = timeline?.latestCursor ?? cursor;
    return c.json({
      ok: true,
      timeline: items,
      items,
      latestCursor,
      cursor: latestCursor,
    });
  });

  app.get("/api/orchestrations/executions/:executionId/snapshot", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const fromDbExecution = await readExecutionFromDb(executionId);
    if (fromDbExecution) {
      const [graph, dbTimeline, mutations] = await Promise.all([
        readExecutionGraphFromDb(executionId),
        readExecutionTimelineFromDb(executionId, "0", 1000),
        readExecutionMutationsFromDb(executionId),
      ]);
      const runtimeTimeline = getOrchestrationExecutionTimeline(executionId, { cursor: "0", limit: 1000 });
      const timelineItems = dbTimeline?.items ?? runtimeTimeline?.items ?? [];
      return c.json({
        ok: true,
        execution: fromDbExecution,
        graph: graph ?? {
          executionId,
          orchestrationId: fromDbExecution.orchestrationId,
          runtimeGraphVersion: Number(fromDbExecution.runtimeGraphVersion ?? 1),
          nodes: [],
          edges: [],
          approvals: [],
        },
        timeline: timelineItems,
        mutations,
      });
    }

    const runtimeSnapshot = getOrchestrationExecutionSnapshot(executionId);
    if (!runtimeSnapshot) {
      return c.json({ ok: false, error: "Execution not found." }, 404);
    }
    return c.json({ ok: true, ...runtimeSnapshot });
  });

  app.get("/api/orchestrations/executions/:executionId/stream", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const execution = (await readExecutionFromDb(executionId)) ?? getOrchestrationExecution(executionId);
    if (!execution) {
      return c.json({ ok: false, error: "Execution not found." }, 404);
    }

    const encoder = new TextEncoder();
    const startedCursor = asString(c.req.query("cursor")) ?? "0";
    const timeoutMs = parseBoundedInteger(c.req.query("timeoutMs"), 25_000, 1_000, 120_000);

    let closed = false;
    let timeout;
    let unsubscribe = () => {};

    const stream = new ReadableStream({
      async start(controller) {
        let cursor = startedCursor;

        const writeEvent = (name, payload) => {
          if (closed) return false;
          try {
            controller.enqueue(encoder.encode(toSseEvent(name, payload)));
            return true;
          } catch {
            closed = true;
            return false;
          }
        };

        const closeStream = () => {
          if (closed) return;
          closed = true;
          if (timeout) {
            clearTimeout(timeout);
            timeout = undefined;
          }
          try {
            unsubscribe();
          } catch {
            // best effort
          }
          try {
            controller.close();
          } catch {
            // ignore
          }
        };

        const fetchBacklog = async () => {
          const fromDb = await readExecutionTimelineFromDb(executionId, cursor, 1000);
          if (fromDb) return fromDb;
          return getOrchestrationExecutionTimeline(executionId, {
            cursor,
            limit: 1000,
          });
        };

        writeEvent("ready", { executionId, cursor });
        try {
          const backlog = await fetchBacklog();
          if (backlog && !closed) {
            for (const item of backlog.items ?? []) {
              if (!writeEvent(item.eventType, item)) return;
            }
            cursor = backlog.latestCursor;
          }
        } catch {
          // best effort backlog
        }

        if (closed) return;

        const detail = getOrchestrationExecution(executionId);
        if (!detail || ["completed", "failed", "canceled"].includes(detail.status)) {
          writeEvent("done", {
            executionId,
            status: detail?.status ?? "completed",
            cursor,
          });
          closeStream();
          return;
        }

        unsubscribe = subscribeOrchestrationExecutionEvents(executionId, (event) => {
          if (!writeEvent(event.eventType, event)) {
            closeStream();
            return;
          }
          cursor = event.cursor;
          const next = getOrchestrationExecution(executionId);
          if (!next || ["completed", "failed", "canceled"].includes(next.status)) {
            writeEvent("done", {
              executionId,
              status: next?.status ?? "completed",
              cursor,
            });
            closeStream();
          }
        });

        timeout = setTimeout(() => {
          writeEvent("done", { executionId, status: "timeout", cursor });
          closeStream();
        }, timeoutMs);
      },
      cancel() {
        closed = true;
        if (timeout) {
          clearTimeout(timeout);
          timeout = undefined;
        }
        try {
          unsubscribe();
        } catch {
          // best effort
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  });

  app.post("/api/orchestrations/executions/:executionId/pause", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const execution = pauseOrchestrationExecution(asString(c.req.param("executionId")) ?? "");
    if (!execution) return c.json({ ok: false, error: "Execution not found." }, 404);
    await syncExecutionRecord(execution);
    return c.json({ ok: true, execution });
  });

  app.post("/api/orchestrations/executions/:executionId/resume", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const execution = resumeOrchestrationExecution(asString(c.req.param("executionId")) ?? "");
    if (!execution) return c.json({ ok: false, error: "Execution not found." }, 404);
    await syncExecutionRecord(execution);
    return c.json({ ok: true, execution });
  });

  app.post("/api/orchestrations/executions/:executionId/cancel", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const execution = cancelOrchestrationExecution(asString(c.req.param("executionId")) ?? "");
    if (!execution) return c.json({ ok: false, error: "Execution not found." }, 404);
    await syncExecutionRecord(execution);
    return c.json({ ok: true, execution });
  });

  app.post("/api/orchestrations/executions/:executionId/mutate", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const body = await readJsonBody(c);
    const op = asString(body.op) ?? asString(body.type) ?? "";
    if (isHighRiskMutationOp(op)) {
      const gated = await enforceSensitiveOperationGate(c, `mutation:${op}`);
      if (gated) return gated;
    }
    try {
      const result = mutateOrchestrationExecution(executionId, body);
      if (!result) return c.json({ ok: false, error: "Execution not found." }, 404);
      await syncExecutionRecord(getOrchestrationExecution(executionId));
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        400,
      );
    }
  });

  app.post("/api/orchestrations/executions/:executionId/retry-node", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const executionId = asString(c.req.param("executionId")) ?? "";
    const body = await readJsonBody(c);
    try {
      const result = mutateOrchestrationExecution(executionId, {
        op: "retry_node",
        nodeId: asString(body.nodeId) ?? "",
      });
      if (!result) return c.json({ ok: false, error: "Execution not found." }, 404);
      await syncExecutionRecord(getOrchestrationExecution(executionId));
      return c.json(result);
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.post("/api/orchestrations/executions/:executionId/replay-from-node", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    const gated = await enforceSensitiveOperationGate(c, "replay_from_node");
    if (gated) return gated;
    const executionId = asString(c.req.param("executionId")) ?? "";
    const body = await readJsonBody(c);
    try {
      const result = mutateOrchestrationExecution(executionId, {
        op: "replay_from_node",
        nodeId: asString(body.nodeId) ?? "",
      });
      if (!result) return c.json({ ok: false, error: "Execution not found." }, 404);
      await syncExecutionRecord(getOrchestrationExecution(executionId));
      return c.json(result);
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.post("/api/orchestrations/executions/:executionId/approvals/:approvalId/decision", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const approvalId = asString(c.req.param("approvalId")) ?? "";
    const body = await readJsonBody(c);
    const action = asString(body.action) ?? "approve";
    const reason = asString(body.reason) ?? "";
    const challengeToken = asString(body.challengeToken) ?? "";

    const result = submitOrchestrationApprovalDecision(
      executionId,
      approvalId,
      action,
      reason,
      challengeToken,
    );
    if (!result) return c.json({ ok: false, error: "Execution not found." }, 404);
    if (!result.ok) return c.json(result, 400);
    await syncExecutionRecord(getOrchestrationExecution(executionId));
    return c.json(result);
  });

  // ── Templates ────────────────────────────────────────────────────────────

  // GET /api/orchestrations/templates — list built-in templates
  app.get("/api/orchestrations/templates", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    return c.json({ items: BUILTIN_TEMPLATES });
  });

  // POST /api/orchestrations/templates/:templateId/create — instantiate template
  app.post("/api/orchestrations/templates/:templateId/create", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const templateId = asString(c.req.param("templateId")) ?? "";
    const template = BUILTIN_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return c.json({ ok: false, error: "Template not found" }, 404);
    }

    const body = await readJsonBody(c);
    const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
    const bindings = Array.isArray(body.roleBindings) ? body.roleBindings : [];
    const byRole = new Map(bindings.map((b) => [b.roleId, b]));

    const nodes = (template.roles || []).map((role, idx) => {
      const override = byRole.get(role.roleId) || {};
      return {
        id: `node-${role.roleId}`,
        role: role.roleId,
        agentId: override.agentId || role.defaultAgentId || `agent-${(idx % 4) + 1}`,
        label: override.displayName || role.displayName || role.roleId,
        position: { x: 140 + idx * 220, y: idx === 0 ? 130 : 280 },
        config: { maxRetries: 2 },
      };
    });
    const edges = (template.edges || []).map(([sourceRole, targetRole]) => ({
      id: `edge-${sourceRole}-${targetRole}`,
      source: `node-${sourceRole}`,
      target: `node-${targetRole}`,
      delegationPolicy: {
        riskCeiling: "medium",
        requiresApproval: sourceRole.includes("manager") || sourceRole.includes("triage"),
      },
    }));

    try {
      const orchestration = await database.createOrchestration({
        name: asString(body.name) || template.suggestedName || template.name,
        description: asString(body.description) || template.suggestedDescription || template.description || "",
        ownerId: authContext?.userId ?? null,
        status: "draft",
        nodes,
        edges,
      });
      mapleLog("info", "orchestration.template_created", {
        templateId,
        orchestrationId: orchestration.id,
      });
      return c.json({ ok: true, id: orchestration.id, orchestration });
    } catch (err) {
      mapleLog("error", "orchestration.template_create_failed", { templateId, error: err.message });
      return c.json({ error: "Failed to create orchestration from template", details: err.message }, 500);
    }
  });

  // ── Conversations ───────────────────────────────────────────────────────

  // GET /api/orchestrations/:id/conversation — get planning conversation
  app.get("/api/orchestrations/:id/conversation", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const id = asString(c.req.param("id")) ?? "";
    const orchestration = await database.findOrchestrationById(id);
    if (!orchestration) {
      return c.json({ ok: false, error: "Orchestration not found" }, 404);
    }

    let items = conversations.get(id);
    if (!items) {
      items = await loadConversationFromDb(id) || [];
      if (items.length > 0) conversations.set(id, items);
    }
    let objPkg = objectivePackages.get(id);
    if (!objPkg) {
      objPkg = await loadObjectivePackageFromDb(id);
      if (objPkg) objectivePackages.set(id, objPkg);
    }
    return c.json({ ok: true, items, objectivePackage: objPkg ?? null });
  });

  // POST /api/orchestrations/:id/conversation — send message in planning conversation
  app.post("/api/orchestrations/:id/conversation", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const id = asString(c.req.param("id")) ?? "";
    const orchestration = await database.findOrchestrationById(id);
    if (!orchestration) {
      return c.json({ ok: false, error: "Orchestration not found" }, 404);
    }

    const body = await readJsonBody(c);
    const message = String(body.message || "").trim();

    if (!conversations.has(id)) {
      const dbItems = await loadConversationFromDb(id);
      conversations.set(id, dbItems || []);
    }
    const items = conversations.get(id);

    if (message) {
      const userMsg = {
        id: `conv-${id}-${items.length + 1}`,
        role: "user",
        text: message,
        createdAt: new Date().toISOString(),
      };
      items.push(userMsg);
      persistConversationMessage(id, userMsg).catch(() => {});
    }

    // Compute objective package
    const incoming = body.objectivePackage || objectivePackages.get(id) || {};
    const contextUrls = Array.isArray(incoming.contextUrls)
      ? incoming.contextUrls
      : String(incoming.contextUrls || "")
          .split(/[\n,]+/g)
          .map((s) => s.trim())
          .filter(Boolean);
    const nextObjective = {
      goal: String(incoming.goal || message || "").trim(),
      successCriteria: String(incoming.successCriteria || "").trim()
        || (message ? "Manager confirms objective complete and all delegated tasks resolved." : ""),
      runtimeLimitMinutes: Number(incoming.runtimeLimitMinutes || 60),
      budgetUsd: Number(incoming.budgetUsd || 0),
      riskCeiling: String(incoming.riskCeiling || "medium"),
      contextUrls,
      outputContract: String(incoming.outputContract || "").trim(),
      escalationPolicy: String(incoming.escalationPolicy || "").trim(),
    };
    objectivePackages.set(id, nextObjective);
    persistObjectivePackage(id, nextObjective).catch(() => {});

    const reply = `Manager update: next loop will plan/delegate around "${nextObjective.goal || "objective"}".`;
    const managerMsg = {
      id: `conv-${id}-${items.length + 1}`,
      role: "manager",
      text: reply,
      createdAt: new Date().toISOString(),
    };
    items.push(managerMsg);
    persistConversationMessage(id, managerMsg).catch(() => {});

    return c.json({ ok: true, items, reply, objectivePackage: nextObjective });
  });

  // ── Execution Tasks ─────────────────────────────────────────────────────

  // GET /api/orchestrations/executions/:executionId/tasks — list tasks for execution
  app.get("/api/orchestrations/executions/:executionId/tasks", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const execution = (await readExecutionFromDb(executionId)) ?? getOrchestrationExecution(executionId);
    if (!execution) {
      return c.json({ ok: false, error: "Execution not found" }, 404);
    }

    if (!executionTasks.has(executionId)) {
      // Try loading from DB first
      const dbTasks = await loadExecutionTasksFromDb(executionId);
      if (dbTasks && dbTasks.length > 0) {
        executionTasks.set(executionId, dbTasks);
      } else {
        // Auto-generate tasks from execution graph nodes
        const graph = (await readExecutionGraphFromDb(executionId)) ?? getOrchestrationExecutionGraph(executionId);
        const nodes = (graph?.nodes || []).filter((node) => node.isInstruction !== true);
        const now = new Date().toISOString();
        const tasks = nodes.map((node, idx) => ({
          id: `${executionId}-task-${idx + 1}`,
          taskId: `${executionId}-task-${idx + 1}`,
          executionId,
          nodeId: node.id,
          title: `${node.label || node.id} task`,
          status: idx === 0 ? "running" : "queued",
          ownerRole: node.role || (idx === 0 ? "manager" : `worker-${idx}`),
          ownerAgentId: node.agentId || null,
          dueAt: new Date(Date.now() + (idx + 1) * 15 * 60 * 1000).toISOString(),
          createdAt: now,
          updatedAt: now,
          history: [{ id: `${executionId}-task-${idx + 1}-h1`, type: "created", timestamp: now }],
        }));
        executionTasks.set(executionId, tasks);
        persistExecutionTasks(executionId, tasks).catch(() => {});
      }
    }

    return c.json({ items: executionTasks.get(executionId) });
  });

  // ── Reassignments ───────────────────────────────────────────────────────

  // POST /api/orchestrations/executions/:executionId/tasks/:taskId/reassign
  app.post("/api/orchestrations/executions/:executionId/tasks/:taskId/reassign", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const taskId = asString(c.req.param("taskId")) ?? "";

    const execution = (await readExecutionFromDb(executionId)) ?? getOrchestrationExecution(executionId);
    if (!execution) {
      return c.json({ ok: false, error: "Execution not found" }, 404);
    }

    const terminalStatuses = ["completed", "failed", "canceled"];
    if (terminalStatuses.includes(execution.status)) {
      return c.json({ ok: false, error: "Execution is terminal; reassignment disabled." }, 409);
    }

    // Ensure tasks exist — load from DB, then fall back to auto-generation
    if (!executionTasks.has(executionId)) {
      const dbTasks = await loadExecutionTasksFromDb(executionId);
      if (dbTasks && dbTasks.length > 0) {
        executionTasks.set(executionId, dbTasks);
      } else {
        const graph = (await readExecutionGraphFromDb(executionId)) ?? getOrchestrationExecutionGraph(executionId);
        const nodes = (graph?.nodes || []).filter((node) => node.isInstruction !== true);
        const now = new Date().toISOString();
        const tasks = nodes.map((node, idx) => ({
          id: `${executionId}-task-${idx + 1}`,
          taskId: `${executionId}-task-${idx + 1}`,
          executionId,
          nodeId: node.id,
          title: `${node.label || node.id} task`,
          status: idx === 0 ? "running" : "queued",
          ownerRole: node.role || (idx === 0 ? "manager" : `worker-${idx}`),
          ownerAgentId: node.agentId || null,
          dueAt: new Date(Date.now() + (idx + 1) * 15 * 60 * 1000).toISOString(),
          createdAt: now,
          updatedAt: now,
          history: [{ id: `${executionId}-task-${idx + 1}-h1`, type: "created", timestamp: now }],
        }));
        executionTasks.set(executionId, tasks);
        persistExecutionTasks(executionId, tasks).catch(() => {});
      }
    }

    const tasks = executionTasks.get(executionId);
    const task = tasks.find((t) => String(t.id) === taskId || String(t.taskId) === taskId);
    if (!task) {
      return c.json({ ok: false, error: "Task not found" }, 404);
    }

    const body = await readJsonBody(c);
    const dueAt = new Date(body.dueAt || "");
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
      return c.json({ ok: false, error: "dueAt must be in the future." }, 400);
    }

    const repeatProvided = body.repeatIntervalMinutes != null && body.repeatIntervalMinutes !== "";
    const repeatIntervalMinutes = repeatProvided ? Number(body.repeatIntervalMinutes) : 0;
    const maxRepeats = body.maxRepeats == null ? 1 : Number(body.maxRepeats);
    if (repeatProvided && repeatIntervalMinutes <= 0) {
      return c.json({ ok: false, error: "repeatIntervalMinutes must be positive." }, 400);
    }
    if (repeatIntervalMinutes > 0 && maxRepeats < 1) {
      return c.json({ ok: false, error: "maxRepeats must be at least 1." }, 400);
    }

    const targetRole = String(body.targetRole || "").trim();
    const targetAgentId = String(body.targetAgentId || "").trim();
    if ((targetRole && targetAgentId) || (!targetRole && !targetAgentId)) {
      return c.json({ ok: false, error: "Provide exactly one reassignment target: role or agent." }, 400);
    }

    const warnings = [];
    if (targetRole) {
      const graph = (await readExecutionGraphFromDb(executionId)) ?? getOrchestrationExecutionGraph(executionId);
      const graphNodes = graph?.nodes || [];
      const mapped = graphNodes.some((node) =>
        String(node.role || node.label || "").toLowerCase().includes(targetRole.toLowerCase()),
      );
      if (!mapped) warnings.push(`No mapped agent exists for role "${targetRole}".`);
    }

    reassignCounter += 1;
    const now = new Date().toISOString();
    const reassignment = {
      id: `reassign-${reassignCounter}`,
      reassignmentId: `reassign-ref-${reassignCounter}`,
      executionId,
      taskId: task.id,
      dueAt: dueAt.toISOString(),
      repeatIntervalMinutes: repeatIntervalMinutes > 0 ? repeatIntervalMinutes : 0,
      maxRepeats: maxRepeats >= 1 ? maxRepeats : 1,
      targetRole: targetRole || null,
      targetAgentId: targetAgentId || null,
      reason: String(body.reason || "").trim(),
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
    };

    if (!executionReassignments.has(executionId)) {
      executionReassignments.set(executionId, []);
    }
    executionReassignments.get(executionId).unshift(reassignment);

    // Persist reassignment to DB
    persistReassignment(executionId, {
      ...reassignment,
      fromRole: task.ownerRole || "",
      fromAgentId: task.ownerAgentId || "",
      warnings,
    }).catch(() => {});

    task.updatedAt = now;
    if (!Array.isArray(task.history)) task.history = [];
    task.history.push({
      id: `${task.id}-h${task.history.length + 1}`,
      type: "reassignment-scheduled",
      timestamp: now,
      targetRole: reassignment.targetRole,
      targetAgentId: reassignment.targetAgentId,
    });

    // Persist updated task state
    persistExecutionTasks(executionId, executionTasks.get(executionId) || []).catch(() => {});

    return c.json({ ok: true, reassignment, warnings, message: "Timed reassignment scheduled." });
  });

  // GET /api/orchestrations/executions/:executionId/reassignments — list reassignments
  app.get("/api/orchestrations/executions/:executionId/reassignments", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const execution = (await readExecutionFromDb(executionId)) ?? getOrchestrationExecution(executionId);
    if (!execution) {
      return c.json({ ok: false, error: "Execution not found" }, 404);
    }

    const items = executionReassignments.get(executionId) || [];
    return c.json({ items });
  });

  // DELETE /api/orchestrations/executions/:executionId/reassignments/:reassignmentId
  app.delete("/api/orchestrations/executions/:executionId/reassignments/:reassignmentId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const reassignmentId = asString(c.req.param("reassignmentId")) ?? "";

    const execution = (await readExecutionFromDb(executionId)) ?? getOrchestrationExecution(executionId);
    if (!execution) {
      return c.json({ ok: false, error: "Execution not found" }, 404);
    }

    const reassignments = executionReassignments.get(executionId) || [];
    const reassignment = reassignments.find(
      (r) => String(r.id) === reassignmentId || String(r.reassignmentId) === reassignmentId,
    );
    if (!reassignment) {
      return c.json({ ok: false, error: "Reassignment not found" }, 404);
    }

    reassignment.status = "canceled";
    reassignment.updatedAt = new Date().toISOString();
    return c.json({ ok: true });
  });

  // POST /api/orchestrations/:id/validate — validate definition
  app.post("/api/orchestrations/:id/validate", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const id = asString(c.req.param("id")) ?? "";
    const body = await readJsonBody(c);

    try {
      const orchestration = await database.findOrchestrationById(id);
      if (!orchestration) {
        return c.json({ ok: false, error: "Orchestration not found." }, 404);
      }

      const requestedVersion = asString(body.definitionVersion) ?? "";
      const resolved = await resolveDefinitionForRuntime(orchestration, requestedVersion);
      const validation = validateOrchestrationDefinition(
        {
          nodes: resolved.orchestration.nodes,
          edges: resolved.orchestration.edges,
        },
        {
          strict: parseBoolean(body.strict, false),
        },
      );

      return c.json(
        {
          ...validation,
          definitionVersion: resolved.resolvedDefinitionVersion,
          versionFound: Boolean(resolved.versionRecord),
        },
        validation.ok ? 200 : 400,
      );
    } catch (err) {
      mapleLog("error", "orchestration.validate_failed", { id, error: err.message });
      return c.json(
        { ok: false, error: "Failed to validate orchestration", details: err.message },
        500,
      );
    }
  });

  // POST /api/orchestrations/:id/execute — create execution
  app.post("/api/orchestrations/:id/execute", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const id = asString(c.req.param("id")) ?? "";
    const body = await readJsonBody(c);
    if (asString(body.mode) !== "dry_run") {
      const gated = await enforceSensitiveOperationGate(c, "execute_live");
      if (gated) return gated;
    }

    try {
      const orchestration = await database.findOrchestrationById(id);
      if (!orchestration) {
        return c.json({ ok: false, error: "Orchestration not found." }, 404);
      }
      if (orchestration.status === "archived") {
        return c.json({ ok: false, error: "Cannot execute an archived orchestration. Restore it first." }, 400);
      }

      const requestedVersion = asString(body.definitionVersion) ?? "";
      const resolved = await resolveDefinitionForRuntime(orchestration, requestedVersion);
      const authContext = authContextStorage.getStore();
      const requestedBy = asString(body.requestedBy) ?? asString(authContext?.userId) ?? "operator";
      const result = createOrchestrationExecution(resolved.orchestration, {
        mode: asString(body.mode) === "dry_run" ? "dry_run" : "live",
        input: buildExecutionInput(body),
        context: body.context,
        startNodeId: asString(body.startNodeId) ?? "",
        mutationPolicy: body.mutationPolicy,
        requestedBy,
        definitionVersion: resolved.resolvedDefinitionVersion,
        strict: parseBoolean(body.strict, false),
      });

      if (!result.ok) {
        return c.json(result, 400);
      }

      if (typeof database.createOrchestrationExecutionRecord === "function") {
        try {
          await database.createOrchestrationExecutionRecord({
            id: result.executionId,
            orchestrationId: id,
            versionId: resolved.versionRecord?.id ?? null,
            status: result.status ?? "queued",
            mode: asString(body.mode) === "dry_run" ? "dry_run" : "live",
            requestedBy,
            input: buildExecutionInput(body),
            context: body.context && typeof body.context === "object" ? body.context : {},
            runLineage: [],
            createdAt: result.createdAt,
            startedAt: result.startedAt || null,
            completedAt: null,
          });
        } catch (recordError) {
          mapleLog("warn", "orchestration.execution_record_create_failed", {
            executionId: result.executionId,
            error: recordError instanceof Error ? recordError.message : String(recordError),
          });
        }
      }

      mapleLog("info", "orchestration.execution_created", {
        orchestrationId: id,
        executionId: result.executionId,
        mode: body.mode,
      });
      await ensureExecutionPersistenceWatch(result.executionId);

      return c.json(
        {
          ...result,
          definitionVersion: resolved.resolvedDefinitionVersion,
          versionFound: Boolean(resolved.versionRecord),
        },
        201,
      );
    } catch (err) {
      mapleLog("error", "orchestration.execute_failed", { id, error: err.message });
      return c.json(
        { ok: false, error: "Failed to execute orchestration", details: err.message },
        500,
      );
    }
  });

  // POST /api/orchestrations/:id/publish — publish current draft as active
  app.post("/api/orchestrations/:id/publish", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const id = asString(c.req.param("id")) ?? "";
    try {
      const existing = await database.findOrchestrationById(id);
      if (!existing) {
        return c.json({ ok: false, error: "Orchestration not found." }, 404);
      }
      const body = await readJsonBody(c);
      const authContext = authContextStorage.getStore();
      const createdBy = asString(body.createdBy) ?? asString(authContext?.userId) ?? "operator";
      const requestedVersion = asString(body.version) ?? "";

      const updated = await database.updateOrchestration(id, { status: "active" });
      let versionRecord = null;
      if (typeof database.createOrchestrationVersion === "function") {
        versionRecord = await database.createOrchestrationVersion({
          orchestrationId: id,
          version: requestedVersion || undefined,
          createdBy,
          definition: {
            nodes: Array.isArray(existing.nodes) ? existing.nodes : [],
            edges: Array.isArray(existing.edges) ? existing.edges : [],
          },
        });
      }

      return c.json({
        ok: true,
        orchestration: updated,
        publishedVersion: versionRecord?.version ?? updated?.updatedAt ?? new Date().toISOString(),
        versionRecord,
      });
    } catch (err) {
      return c.json(
        { ok: false, error: "Failed to publish orchestration", details: err.message },
        500,
      );
    }
  });

  // GET /api/orchestrations/:id — get single orchestration (ownership enforced)
  app.get("/api/orchestrations/:id", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
    const id = c.req.param("id");
    try {
      const orchestration = await database.findOrchestrationById(id);
      if (!orchestration || (authContext?.userId && orchestration.ownerId && orchestration.ownerId !== authContext.userId)) {
        return c.json({ error: "Orchestration not found" }, 404);
      }
      return c.json(orchestration);
    } catch (err) {
      mapleLog("error", "orchestration.get_failed", { id, error: err.message });
      return c.json(
        { error: "Failed to get orchestration", details: err.message },
        500,
      );
    }
  });

  // PATCH /api/orchestrations/:id — update orchestration (ownership enforced)
  app.patch("/api/orchestrations/:id", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
    const id = c.req.param("id");
    const existing = await database.findOrchestrationById(id);
    if (!existing || (authContext?.userId && existing.ownerId && existing.ownerId !== authContext.userId)) {
      return c.json({ error: "Orchestration not found" }, 404);
    }
    if (existing.status === "archived") {
      return c.json({ error: "Cannot modify an archived orchestration. Restore it first." }, 400);
    }
    const body = await readJsonBody(c);

    const updates = {};
    if (body.name !== undefined) updates.name = asString(body.name);
    if (body.description !== undefined) updates.description = asString(body.description);
    if (body.status !== undefined) updates.status = asString(body.status);
    if (body.nodes !== undefined) updates.nodes = body.nodes;
    if (body.edges !== undefined) updates.edges = body.edges;

    try {
      const orchestration = await database.updateOrchestration(id, updates);
      if (!orchestration) {
        return c.json({ error: "Orchestration not found" }, 404);
      }
      mapleLog("info", "orchestration.updated", { id, updates: Object.keys(updates) });
      return c.json(orchestration);
    } catch (err) {
      mapleLog("error", "orchestration.update_failed", { id, error: err.message });
      return c.json(
        { error: "Failed to update orchestration", details: err.message },
        500,
      );
    }
  });

  // DELETE /api/orchestrations/:id — archive orchestration (ownership enforced)
  app.delete("/api/orchestrations/:id", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
    const id = c.req.param("id");
    try {
      const existing = await database.findOrchestrationById(id);
      if (!existing || (authContext?.userId && existing.ownerId && existing.ownerId !== authContext.userId)) {
        return c.json({ error: "Orchestration not found" }, 404);
      }
      const orchestration = await database.archiveOrchestration(id);
      if (!orchestration) {
        return c.json({ error: "Orchestration not found" }, 404);
      }
      mapleLog("info", "orchestration.archived", { id });
      return c.json({ archived: true, orchestration });
    } catch (err) {
      mapleLog("error", "orchestration.archive_failed", { id, error: err.message });
      return c.json(
        { error: "Failed to archive orchestration", details: err.message },
        500,
      );
    }
  });

  // POST /api/orchestrations/:id/restore — restore archived orchestration
  app.post("/api/orchestrations/:id/restore", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
    const id = c.req.param("id");
    try {
      const existing = await database.findOrchestrationById(id);
      if (!existing || existing.status !== "archived" ||
          (authContext?.userId && existing.ownerId && existing.ownerId !== authContext.userId)) {
        return c.json({ error: "Archived orchestration not found" }, 404);
      }
      const orchestration = await database.restoreOrchestration(id);
      mapleLog("info", "orchestration.restored", { id });
      return c.json({ restored: true, orchestration });
    } catch (err) {
      mapleLog("error", "orchestration.restore_failed", { id, error: err.message });
      return c.json({ error: "Failed to restore orchestration", details: err.message }, 500);
    }
  });

  // DELETE /api/orchestrations/:id/permanent — permanently delete archived orchestration
  app.delete("/api/orchestrations/:id/permanent", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const authContext = c.get("mapleAuthContext") ?? authContextStorage.getStore();
    const id = c.req.param("id");
    try {
      const existing = await database.findOrchestrationById(id);
      if (!existing || existing.status !== "archived" ||
          (authContext?.userId && existing.ownerId && existing.ownerId !== authContext.userId)) {
        return c.json({ error: "Archived orchestration not found" }, 404);
      }
      const orchestration = await database.permanentlyDeleteOrchestration(id);
      if (!orchestration) {
        return c.json({ error: "Orchestration not found" }, 404);
      }
      mapleLog("info", "orchestration.permanently_deleted", { id });
      return c.json({ deleted: true, orchestration });
    } catch (err) {
      mapleLog("error", "orchestration.permanent_delete_failed", { id, error: err.message });
      return c.json({ error: "Failed to permanently delete orchestration", details: err.message }, 500);
    }
  });
}
