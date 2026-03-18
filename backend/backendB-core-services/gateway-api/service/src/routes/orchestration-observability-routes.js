import { authContextStorage, requireApiKeyResponse } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { database, server } from "../state.js";
import { allowNoAuth } from "../config.js";
import { hasValidStepUp } from "../core/step-up-auth.js";
import { flushOutbox, getOutboxHealth, replayAuditEvents } from "../core/audit-outbox.js";
import {
  enforceRetention,
  getRetentionPolicy,
  queryAuditChain,
  setRetentionPolicy,
  verifyAuditChain,
} from "../core/audit-integrity.js";
import {
  deleteAlertWebhook,
  getAlertDeliveryLog,
  listAlertWebhooks,
  registerAlertWebhook,
} from "../core/alert-webhook.js";
import {
  getOrchestrationObservabilitySummary,
  getOrchestrationSloSignals,
  forkOrchestrationExecution,
  getOrchestrationExecution,
} from "../core/orchestration-runtime.js";
import { ensureExecutionPersistenceWatch } from "./orchestration-routes.js";
import { resolveVerifiedTenantScope } from "../core/tenant-claim-resolver.js";

/**
 * Resolve verified tenant scope. Observability endpoints MUST be tenant-scoped
 * to prevent cross-tenant data leakage. Omitting tenant headers is rejected
 * (fail-closed) unless allowEmpty is explicitly true.
 */
async function verifiedScope(c, { allowEmpty = false } = {}) {
  const ctx = authContextStorage.getStore();
  const authBypass = ctx?.authBypass === true;
  const rawTenantId = asString(c.req.header("x-tenant-id")) ?? "";
  const rawOrgId = asString(c.req.header("x-org-id")) ?? "";

  // In local dev (allowNoAuth) or admin bootstrap (authBypass),
  // allow unscoped access when no tenant headers are provided.
  if ((authBypass || allowNoAuth) && !rawTenantId && !rawOrgId) {
    return { error: false, tenantId: "", orgId: "" };
  }

  const scope = await resolveVerifiedTenantScope({
    tenantId: rawTenantId,
    orgId: rawOrgId,
    tenantClaimSignature: asString(c.req.header("x-maple-tenant-claim")) ?? "",
  });
  if (!scope.verified && scope.tenantId) {
    return { error: true, tenantId: "", orgId: "" };
  }
  if (!allowEmpty && !scope.tenantId) {
    return { error: true, tenantId: "", orgId: "" };
  }
  return { error: false, tenantId: scope.tenantId, orgId: scope.orgId };
}

function actorUserId() {
  const ctx = authContextStorage.getStore();
  return asString(ctx?.userId) ?? asString(ctx?.keyFingerprint) ?? "gateway-api";
}

async function enforceForkStepUp(c) {
  const ctx = authContextStorage.getStore();
  const userId = asString(ctx?.userId) ?? "";
  if (!userId) return null;
  const scope = await verifiedScope(c);
  const stepUp = await hasValidStepUp(userId, {
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    database,
  });
  if (stepUp?.valid === true) return null;
  c.status(403);
  return c.json({
    ok: false,
    error: "Step-up verification required",
    operation: "fork_execution",
    stepUpStatus: stepUp,
    replacement: "/api/operations/orchestrations/step-up/challenge",
  });
}

function parseBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeSince(value) {
  return asString(value) ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function normalizeUntil(value) {
  return asString(value) ?? new Date().toISOString();
}

function asFormat(value) {
  const format = asString(value)?.toLowerCase() ?? "json";
  if (["json", "ndjson", "cef", "syslog"].includes(format)) return format;
  return "json";
}

function toCef(eventRow) {
  const event = eventRow?.event ?? {};
  const type = asString(event.eventType) ?? "ORCHESTRATION_EVENT";
  const summary = asString(event.summary) ?? "Orchestration event";
  const severity = asString(event.severity) ?? "RISK_SEVERITY_LOW";
  return `CEF:0|Maple|Orchestration|1.0|${type}|${summary}|${severity}|outboxId=${eventRow.outboxId} status=${eventRow.status}`;
}

function toSyslog(eventRow) {
  const event = eventRow?.event ?? {};
  const type = asString(event.eventType) ?? "ORCHESTRATION_EVENT";
  const summary = asString(event.summary) ?? "Orchestration event";
  return `<14>1 ${eventRow.createdAt ?? new Date().toISOString()} maple gateway - - - ${type} ${summary} outboxId=${eventRow.outboxId} status=${eventRow.status}`;
}

server.app.get("/api/observability/orchestrations/summary", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);

  const outbox = await getOutboxHealth({ database });
  const orchestration = getOrchestrationObservabilitySummary();
  return c.json({
    ok: true,
    outbox,
    ...orchestration,
  });
});

server.app.get("/api/observability/orchestrations/slo", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);

  const windowMs = c.req.query("windowMs") ?? c.req.query("window");
  const signals = getOrchestrationSloSignals({ windowMs });
  const outbox = await getOutboxHealth({ database });
  return c.json({
    ...signals,
    auditDelivery: {
      pending: outbox.pending ?? 0,
      deadLetter: outbox.deadLetter ?? 0,
      healthy: (outbox.deadLetter ?? 0) === 0,
    },
  });
});

server.app.get("/api/observability/orchestrations/audit-log", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);

  const since = normalizeSince(c.req.query("since") ?? c.req.query("from"));
  const until = normalizeUntil(c.req.query("until") ?? c.req.query("to"));
  const status = asString(c.req.query("status")) ?? null;
  const limit = parseBoundedInteger(c.req.query("limit"), 100, 1, 1000);
  const offset = parseBoundedInteger(c.req.query("offset") ?? c.req.query("cursor"), 0, 0, 1_000_000);

  const replay = await replayAuditEvents({
    since,
    until,
    status,
    limit,
    offset,
    tenantId: scope.tenantId,
    database,
  });

  const nextOffset = offset + replay.events.length < replay.total ? offset + replay.events.length : null;

  return c.json({
    ok: true,
    items: replay.events,
    events: replay.events,
    entries: replay.events,
    total: replay.total,
    offset,
    cursor: String(offset),
    nextOffset,
    nextCursor: nextOffset != null ? String(nextOffset) : null,
    limit,
    since,
    until,
  });
});

server.app.post("/api/observability/orchestrations/export", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);

  const body = await readJsonBody(c);
  const since = normalizeSince(body.since ?? body.from);
  const until = normalizeUntil(body.until ?? body.to);
  const format = asFormat(body.format);
  const limit = parseBoundedInteger(body.limit, 2000, 1, 5000);

  const replay = await replayAuditEvents({
    since,
    until,
    status: asString(body.status) ?? null,
    limit,
    offset: 0,
    tenantId: scope.tenantId,
    database,
  });

  if (format === "ndjson") {
    const payload = replay.events.map((item) => JSON.stringify(item)).join("\n");
    return new Response(`${payload}\n`, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson",
      },
    });
  }

  if (format === "cef") {
    const payload = replay.events.map(toCef).join("\n");
    return new Response(`${payload}\n`, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  if (format === "syslog") {
    const payload = replay.events.map(toSyslog).join("\n");
    return new Response(`${payload}\n`, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  return c.json({
    ok: true,
    format: "json",
    items: replay.events,
    total: replay.total,
    since,
    until,
    exportedAt: new Date().toISOString(),
  });
});

server.app.post("/api/observability/orchestrations/flush", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const result = await flushOutbox({ database });
  return c.json({ ok: true, ...result, flushedAt: new Date().toISOString() });
});

server.app.get("/api/observability/orchestrations/audit-chain", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const result = await queryAuditChain(
    {
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      eventType: asString(c.req.query("eventType")) ?? null,
      severity: asString(c.req.query("severity")) ?? null,
      since: asString(c.req.query("since")) ?? null,
      until: asString(c.req.query("until")) ?? null,
    },
    {
      limit: parseBoundedInteger(c.req.query("limit"), 100, 1, 1000),
      offset: parseBoundedInteger(c.req.query("offset") ?? c.req.query("cursor"), 0, 0, 1_000_000),
      database,
    },
  );

  return c.json({ ok: true, ...result });
});

server.app.get("/api/observability/orchestrations/audit-chain/verify", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);

  const result = await verifyAuditChain({
    tenantId: scope.tenantId,
    limit: parseBoundedInteger(c.req.query("limit"), 1000, 1, 10_000),
    database,
  });
  return c.json({ ok: true, ...result });
});

server.app.get("/api/observability/orchestrations/retention", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const tenantId = scope.tenantId;
  const policy = await getRetentionPolicy(tenantId, { database });
  return c.json({ ok: true, ...policy });
});

server.app.post("/api/observability/orchestrations/retention", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const tenantId = scope.tenantId;
  const body = await readJsonBody(c);
  const retentionDays = parseBoundedInteger(body.retentionDays ?? body.days, 90, 1, 3650);
  await setRetentionPolicy(tenantId, retentionDays, { updatedBy: actorUserId(), database });
  return c.json({ ok: true, retentionDays });
});

server.app.post("/api/observability/orchestrations/retention/enforce", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const result = await enforceRetention({ database });
  return c.json({ ok: true, ...result });
});

server.app.get("/api/observability/orchestrations/dead-letter", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);

  const limit = parseBoundedInteger(c.req.query("limit"), 50, 1, 1000);
  const offset = parseBoundedInteger(c.req.query("offset") ?? c.req.query("cursor"), 0, 0, 1_000_000);

  // Tenant-scoped dead-letter query. The event_json column contains a JSON
  // object with tenantId at the top level or nested in payload. We filter in
  // SQL via JSON extraction to avoid loading all rows into memory.
  const tenantFilter = scope.tenantId
    ? `AND (event_json::jsonb->>'tenantId' = $3 OR event_json::jsonb->'payload'->>'tenantId' = $3)`
    : "";
  const queryParams = scope.tenantId ? [limit, offset, scope.tenantId] : [limit, offset];
  const countParams = scope.tenantId ? [scope.tenantId] : [];

  const result = await database.pool.query(
    `SELECT outbox_id, event_json, status, created_at, updated_at, attempts, last_error
       FROM gateway_audit_outbox
      WHERE status = 'dead_letter' ${tenantFilter}
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
    queryParams,
  );

  const countResult = await database.pool.query(
    `SELECT COUNT(*)::int AS total FROM gateway_audit_outbox WHERE status = 'dead_letter' ${tenantFilter ? `AND (event_json::jsonb->>'tenantId' = $1 OR event_json::jsonb->'payload'->>'tenantId' = $1)` : ""}`,
    countParams,
  );

  const items = result.rows.map((row) => {
    let event = null;
    try {
      event = JSON.parse(row.event_json);
    } catch {
      event = { raw: row.event_json };
    }
    return {
      outboxId: row.outbox_id,
      status: row.status,
      event,
      attempts: Number(row.attempts ?? 0),
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  const total = Number(countResult.rows[0]?.total ?? 0);
  const nextOffset = offset + items.length < total ? offset + items.length : null;

  return c.json({
    ok: true,
    items,
    total,
    offset,
    cursor: String(offset),
    nextOffset,
    nextCursor: nextOffset != null ? String(nextOffset) : null,
  });
});

server.app.post("/api/observability/orchestrations/dead-letter/:eventId/replay", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);

  const eventId = asString(c.req.param("eventId")) ?? "";

  // Always verify the event belongs to the caller's tenant before replaying.
  const check = await database.pool.query(
    `SELECT event_json FROM gateway_audit_outbox WHERE outbox_id = $1 AND status = 'dead_letter'`,
    [eventId],
  );
  if (check.rows.length === 0) {
    return c.json({ ok: false, error: "Dead-letter event not found." }, 404);
  }
  try {
    const event = JSON.parse(check.rows[0].event_json);
    const eventTenantId = event?.payload?.tenantId ?? event?.tenantId ?? "";
    if (eventTenantId !== scope.tenantId) {
      return c.json({ ok: false, error: "Dead-letter event not found." }, 404);
    }
  } catch {
    // If event_json is unparseable, reject to be safe
    return c.json({ ok: false, error: "Dead-letter event is malformed." }, 400);
  }

  const now = new Date().toISOString();
  const result = await database.pool.query(
    `UPDATE gateway_audit_outbox
        SET status = 'pending',
            next_attempt_at = $2,
            updated_at = $2,
            last_error = ''
      WHERE outbox_id = $1 AND status = 'dead_letter'`,
    [eventId, now],
  );

  if ((result.rowCount ?? 0) === 0) {
    return c.json({ ok: false, error: "Dead-letter event not found." }, 404);
  }

  return c.json({ ok: true, replayed: true, eventId });
});

server.app.get("/api/observability/orchestrations/alert-webhooks", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const webhooks = await listAlertWebhooks(scope.tenantId, { database });
  return c.json({ ok: true, items: webhooks, webhooks });
});

server.app.post("/api/observability/orchestrations/alert-webhooks", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const body = await readJsonBody(c);
  try {
    const webhook = await registerAlertWebhook(
      {
        ...body,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        createdBy: actorUserId(),
      },
      { database },
    );
    return c.json({ ok: true, webhook });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

server.app.delete("/api/observability/orchestrations/alert-webhooks/:id", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  await deleteAlertWebhook(asString(c.req.param("id")) ?? "", { tenantId: scope.tenantId, database });
  return c.json({ ok: true });
});

server.app.get("/api/observability/orchestrations/alert-webhooks/:id/deliveries", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = await verifiedScope(c);
  if (scope.error) return c.json({ ok: false, error: "Unverified tenant scope rejected" }, 403);
  const deliveries = await getAlertDeliveryLog(asString(c.req.param("id")) ?? "", { tenantId: scope.tenantId, database });
  return c.json({ ok: true, items: deliveries, deliveries });
});

server.app.post("/api/observability/orchestrations/executions/:executionId/fork", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const gated = await enforceForkStepUp(c);
  if (gated) return gated;

  const executionId = asString(c.req.param("executionId")) ?? "";
  const body = await readJsonBody(c);
  const requestedBy = actorUserId();

  const result = forkOrchestrationExecution(executionId, {
    forkFromSequence: Number(body.forkFromSequence ?? 0),
    edits: Array.isArray(body.edits) ? body.edits : [],
    launchMode: asString(body.launchMode) === "dry_run" ? "dry_run" : "live",
    requestedBy,
  });

  if (!result?.ok) {
    const status = String(result?.error || "").toLowerCase().includes("not found") ? 404 : 400;
    return c.json(result ?? { ok: false, error: "Fork failed." }, status);
  }

  if (typeof database.createOrchestrationExecutionRecord === "function") {
    const forkExecution = getOrchestrationExecution(result.forkExecutionId);
    if (forkExecution?.orchestrationId) {
      let versionId = null;
      if (database?.pool) {
        const versionResult = await database.pool.query(
          `SELECT version_id
             FROM orchestration_executions
            WHERE id = $1
            LIMIT 1`,
          [result.parentExecutionId],
        );
        versionId = versionResult.rows[0]?.version_id ?? null;
      }

      await database.createOrchestrationExecutionRecord({
        id: result.forkExecutionId,
        orchestrationId: forkExecution.orchestrationId,
        versionId,
        status: forkExecution.status ?? "queued",
        mode: asString(body.launchMode) === "dry_run" ? "dry_run" : "live",
        requestedBy,
        input: {
          forkFromSequence: Number(body.forkFromSequence ?? 0),
          parentExecutionId: result.parentExecutionId,
          launchMode: asString(body.launchMode) === "dry_run" ? "dry_run" : "live",
        },
        context: {
          fork: {
            parentExecutionId: result.parentExecutionId,
          },
        },
        runLineage: [],
        createdAt: result.launchedAt ?? new Date().toISOString(),
        startedAt: forkExecution.startedAt || null,
        completedAt: forkExecution.completedAt || null,
      });
    }
  }

  await ensureExecutionPersistenceWatch(result.forkExecutionId);

  if (body.waitForExecution === true) {
    const timeoutMs = parseBoundedInteger(body.waitTimeoutMs, 20_000, 1_000, 120_000);
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const current = getOrchestrationExecution(result.forkExecutionId);
      if (!current) break;
      if (["completed", "failed", "canceled"].includes(current.status)) {
        result.executionStatus = current.status;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return c.json(result, 201);
});
