import { randomUUID } from "node:crypto";
import { getGrpcClients } from "../state.js";
import { grpcUnary } from "../grpc-clients.js";
import { mapleLog } from "../logging.js";
import {
  openclawModifierAuditOutboxEnabled,
  openclawModifierAuditOutboxIntervalMs,
  openclawModifierAuditOutboxBatchSize,
  openclawModifierAuditOutboxMaxRetries,
} from "../config.js";
import { withLeaderLock, LOCK_IDS } from "./leader-election.js";

let _database = null;
let _flushTimer = null;
let _flushing = false;

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

function backoffMs(attempts) {
  return Math.min(60_000, 1000 * Math.pow(2, Math.min(attempts, 6)));
}

/**
 * Enqueue an audit event into the durable outbox.
 * Falls back to fire-and-forget gRPC if outbox is disabled or no DB.
 */
export async function enqueueAuditEvent(options) {
  const event = {
    eventId: randomUUID(),
    eventType: options.eventType,
    timestamp: new Date().toISOString(),
    sourceService: options.sourceService,
    context: {
      traceId: options.traceId ?? "",
      sessionId: options.sessionId ?? "",
      userId: options.userId ?? "",
    },
    // B2: Propagate trace context through outbox
    traceId: options.traceId ?? "",
    spanId: options.spanId ?? "",
    payloadJson: JSON.stringify(options.payload ?? {}),
    severity: options.severity ?? "RISK_SEVERITY_LOW",
    summary: options.summary,
  };

  if (!openclawModifierAuditOutboxEnabled || !hasPool(_database)) {
    fireAndForgetGrpc(event);
    return { queued: false, eventId: event.eventId };
  }

  const now = nowIso();
  try {
    await _database.pool.query(
      `INSERT INTO gateway_audit_outbox (outbox_id, event_json, status, created_at, updated_at, next_attempt_at, delivered_at, attempts, last_error)
       VALUES ($1, $2, 'pending', $3, $3, $3, NULL, 0, '')`,
      [event.eventId, JSON.stringify(event), now]
    );
    return { queued: true, eventId: event.eventId };
  } catch (err) {
    mapleLog("warn", "audit_outbox.enqueue_failed", {
      eventId: event.eventId,
      error: err instanceof Error ? err.message : String(err),
    });
    fireAndForgetGrpc(event);
    return { queued: false, eventId: event.eventId };
  }
}

function fireAndForgetGrpc(event) {
  const clients = getGrpcClients();
  if (!clients?.auditWriter) {
    return;
  }
  const grpcEvent = {
    ...event,
    payloadJson:
      typeof event.payloadJson === "string"
        ? Buffer.from(event.payloadJson)
        : event.payloadJson,
  };
  grpcUnary(clients.auditWriter, "appendEvent", { event: grpcEvent }).catch(
    (err) => {
      mapleLog("warn", "audit_outbox.grpc_fallback_failed", {
        eventId: event.eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  );
}

/**
 * Flush pending outbox events to audit-writer via gRPC.
 * Returns { flushed, failed, skipped }.
 */
export async function flushOutbox(options = {}) {
  if (_flushing) {
    return { flushed: 0, failed: 0, skipped: 0, reason: "already_flushing" };
  }
  _flushing = true;
  const batchSize = options.batchSize ?? openclawModifierAuditOutboxBatchSize;
  const db = options.database ?? _database;

  try {
    if (!hasPool(db)) {
      return { flushed: 0, failed: 0, skipped: 0, reason: "no_database" };
    }

    const now = nowIso();
    const result = await db.pool.query(
      `SELECT outbox_id, event_json, attempts
       FROM gateway_audit_outbox
       WHERE status = 'pending' AND next_attempt_at <= $1
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [now, batchSize]
    );

    if (result.rows.length === 0) {
      return { flushed: 0, failed: 0, skipped: 0 };
    }

    let flushed = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of result.rows) {
      const outboxId = row.outbox_id;
      const attempts = Number(row.attempts ?? 0);

      if (attempts >= openclawModifierAuditOutboxMaxRetries) {
        await db.pool.query(
          `UPDATE gateway_audit_outbox SET status = 'dead_letter', updated_at = $2 WHERE outbox_id = $1`,
          [outboxId, nowIso()]
        );
        skipped += 1;
        continue;
      }

      let event;
      try {
        event = JSON.parse(row.event_json);
      } catch {
        await db.pool.query(
          `UPDATE gateway_audit_outbox SET status = 'dead_letter', last_error = 'invalid_json', updated_at = $2 WHERE outbox_id = $1`,
          [outboxId, nowIso()]
        );
        skipped += 1;
        continue;
      }

      try {
        const clients = getGrpcClients();
        if (!clients?.auditWriter) {
          throw new Error("audit-writer gRPC client unavailable");
        }
        const grpcEvent = {
          ...event,
          payloadJson:
            typeof event.payloadJson === "string"
              ? Buffer.from(event.payloadJson)
              : event.payloadJson,
        };
        await grpcUnary(clients.auditWriter, "appendEvent", {
          event: grpcEvent,
        });
        await db.pool.query(
          `UPDATE gateway_audit_outbox SET status = 'delivered', delivered_at = $2, updated_at = $2, attempts = attempts + 1 WHERE outbox_id = $1`,
          [outboxId, nowIso()]
        );
        flushed += 1;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        const nextAttempt = new Date(
          Date.now() + backoffMs(attempts + 1)
        ).toISOString();
        await db.pool.query(
          `UPDATE gateway_audit_outbox SET attempts = attempts + 1, last_error = $2, next_attempt_at = $3, updated_at = $4 WHERE outbox_id = $1`,
          [outboxId, errorMessage, nextAttempt, nowIso()]
        );
        failed += 1;
      }
    }

    return { flushed, failed, skipped };
  } finally {
    _flushing = false;
  }
}

/**
 * Replay/export audit events from outbox for a given time range.
 */
export async function replayAuditEvents(options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) {
    return { events: [], total: 0 };
  }

  const since = options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const until = options.until ?? nowIso();
  const statusFilter = options.status ?? null;
  const limit = Math.max(1, Math.min(1000, Number(options.limit) || 200));
  const offset = Math.max(0, Number(options.offset) || 0);

  const conditions = ["created_at >= $1", "created_at <= $2"];
  const params = [since, until];
  let cursor = 3;

  if (statusFilter) {
    conditions.push(`status = $${cursor++}`);
    params.push(statusFilter);
  }

  params.push(limit, offset);
  const where = conditions.join(" AND ");

  const countResult = await db.pool.query(
    `SELECT COUNT(*)::int AS total FROM gateway_audit_outbox WHERE ${where}`,
    params.slice(0, cursor - 1)
  );

  const result = await db.pool.query(
    `SELECT outbox_id, event_json, status, created_at, updated_at, delivered_at, attempts, last_error
     FROM gateway_audit_outbox
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${cursor++} OFFSET $${cursor}`,
    params
  );

  const events = result.rows.map((row) => {
    let event = null;
    try {
      event = JSON.parse(row.event_json);
    } catch {
      event = { raw: row.event_json };
    }
    return {
      outboxId: row.outbox_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deliveredAt: row.delivered_at,
      attempts: Number(row.attempts ?? 0),
      lastError: row.last_error,
      event,
    };
  });

  return {
    events,
    total: Number(countResult.rows[0]?.total ?? 0),
    since,
    until,
    limit,
    offset,
  };
}

/**
 * Get outbox health summary for observability.
 */
export async function getOutboxHealth(options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) {
    return { enabled: false, reason: "no_database" };
  }

  const result = await db.pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter,
      COUNT(*)::int AS total,
      MIN(created_at) FILTER (WHERE status = 'pending') AS oldest_pending,
      MAX(delivered_at) FILTER (WHERE status = 'delivered') AS last_delivered
    FROM gateway_audit_outbox
  `);

  const row = result.rows[0] ?? {};
  return {
    enabled: openclawModifierAuditOutboxEnabled,
    pending: Number(row.pending ?? 0),
    delivered: Number(row.delivered ?? 0),
    deadLetter: Number(row.dead_letter ?? 0),
    total: Number(row.total ?? 0),
    oldestPending: row.oldest_pending ?? null,
    lastDelivered: row.last_delivered ?? null,
  };
}

/**
 * Start the periodic outbox flush worker.
 */
export function startAuditOutboxWorker(options = {}) {
  if (options.database) {
    _database = options.database;
  }
  if (!openclawModifierAuditOutboxEnabled) {
    mapleLog("info", "audit_outbox.worker_disabled", {});
    return;
  }
  if (_flushTimer) {
    return;
  }
  // A9: Wrap flush with leader election for multi-instance HA
  _flushTimer = setInterval(() => {
    withLeaderLock(LOCK_IDS.OUTBOX_WORKER, _database, () => flushOutbox()).catch((err) => {
      if (err && typeof err === "object" && err.skipped) return; // not leader, skip
      mapleLog("warn", "audit_outbox.flush_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, openclawModifierAuditOutboxIntervalMs);

  if (_flushTimer.unref) {
    _flushTimer.unref();
  }
  mapleLog("info", "audit_outbox.worker_started", {
    intervalMs: openclawModifierAuditOutboxIntervalMs,
    batchSize: openclawModifierAuditOutboxBatchSize,
  });
}

/**
 * Stop the outbox flush worker, flushing pending events first.
 */
export async function stopAuditOutboxWorker() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  try {
    await flushOutbox();
  } catch {
    // best effort on shutdown
  }
}
