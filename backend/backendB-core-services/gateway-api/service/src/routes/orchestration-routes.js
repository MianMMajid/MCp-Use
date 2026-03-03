import { database } from "../state.js";
import { requireApiKeyResponse, authContextStorage } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { hasValidStepUp } from "../core/step-up-auth.js";
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

  const tenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const orgId = asString(c.req.header("x-org-id")) ?? "";
  const stepUp = await hasValidStepUp(userId, { tenantId, orgId, database });
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
      `SELECT node_id, status, retry_count, started_at, completed_at, error_text, output_preview
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
    nodes: nodesResult.rows.map((row) => ({
      id: row.node_id,
      status: row.status,
      retryCount: Number(row.retry_count ?? 0),
      startedAt: row.started_at ?? "",
      completedAt: row.completed_at ?? "",
      error: row.error_text ?? "",
      outputPreview: row.output_preview ?? "",
    })),
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
    return {
      executionId,
      items: [],
      latestCursor: String(Number(latest.rows[0]?.max_sequence ?? afterSequence)),
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

  for (const node of graph.nodes ?? []) {
    await database.pool.query(
      `INSERT INTO orchestration_execution_nodes
         (id, execution_id, node_id, status, retry_count, started_at, completed_at, error_text, output_preview, cost_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}')
       ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status,
           retry_count = EXCLUDED.retry_count,
           started_at = EXCLUDED.started_at,
           completed_at = EXCLUDED.completed_at,
           error_text = EXCLUDED.error_text,
           output_preview = EXCLUDED.output_preview`,
      [
        `${execution.executionId}:${node.id}`,
        execution.executionId,
        node.id,
        node.status ?? "pending",
        Number(node.retryCount ?? 0),
        node.startedAt || null,
        node.completedAt || null,
        node.error ?? "",
        node.outputPreview ?? "",
      ],
    );
  }

  for (const edge of graph.edges ?? []) {
    await database.pool.query(
      `INSERT INTO orchestration_execution_edges
         (id, execution_id, edge_id, source_node_id, target_node_id, active, delegation_policy_json, rewired_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
       ON CONFLICT (id) DO UPDATE
       SET source_node_id = EXCLUDED.source_node_id,
           target_node_id = EXCLUDED.target_node_id,
           active = EXCLUDED.active,
           delegation_policy_json = EXCLUDED.delegation_policy_json`,
      [
        `${execution.executionId}:${edge.id}`,
        execution.executionId,
        edge.id,
        edge.source ?? "",
        edge.target ?? "",
        edge.active !== false,
        JSON.stringify(edge.delegationPolicy ?? {}),
      ],
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

async function resolveDefinitionForRuntime(orchestration, definitionVersion) {
  const versionRecord = await findOrchestrationVersion(orchestration.id, definitionVersion);
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
    const authContext = authContextStorage.getStore();
    const ownerId = asString(body.ownerId) ?? authContext?.userId ?? null;

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

    const filters = {};
    const ownerId = c.req.query("ownerId");
    const status = c.req.query("status");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    if (ownerId) filters.ownerId = ownerId;
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
    const graph = (await readExecutionGraphFromDb(executionId)) ?? getOrchestrationExecutionGraph(executionId);
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
    const timeline = (await readExecutionTimelineFromDb(executionId, cursor, limit))
      ?? getOrchestrationExecutionTimeline(executionId, { cursor, limit });
    if (!timeline) {
      return c.json({ ok: false, error: "Execution not found." }, 404);
    }
    return c.json({
      ok: true,
      timeline: timeline.items,
      items: timeline.items,
      latestCursor: timeline.latestCursor,
      cursor: timeline.latestCursor,
    });
  });

  app.get("/api/orchestrations/executions/:executionId/snapshot", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const executionId = asString(c.req.param("executionId")) ?? "";
    const fromDbExecution = await readExecutionFromDb(executionId);
    if (fromDbExecution) {
      const [graph, timeline, mutations] = await Promise.all([
        readExecutionGraphFromDb(executionId),
        readExecutionTimelineFromDb(executionId, "0", 1000),
        readExecutionMutationsFromDb(executionId),
      ]);
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
        timeline: timeline?.items ?? [],
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

  // GET /api/orchestrations/:id — get single orchestration
  app.get("/api/orchestrations/:id", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const id = c.req.param("id");
    try {
      const orchestration = await database.findOrchestrationById(id);
      if (!orchestration) {
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

  // PATCH /api/orchestrations/:id — update orchestration
  app.patch("/api/orchestrations/:id", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const id = c.req.param("id");
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

  // DELETE /api/orchestrations/:id — archive orchestration (soft delete)
  app.delete("/api/orchestrations/:id", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const id = c.req.param("id");
    try {
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
}
