/**
 * audit-integrity.js
 *
 * Append-only audit log with cryptographic hash chaining.
 * Each audit record includes a hash of itself + the previous record's hash,
 * creating a tamper-evident chain. Also handles retention policy enforcement.
 */
import { createHash, randomUUID } from "node:crypto";
import { mapleLog } from "../logging.js";

let _database = null;

const DEFAULT_RETENTION_DAYS = 90;
const MAX_RETENTION_DAYS = 730; // 2 years

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Configure the audit integrity module.
 */
export function configureAuditIntegrity(options = {}) {
  if (options.database) {
    _database = options.database;
  }
}

/**
 * Ensure the audit chain table exists.
 */
export async function ensureAuditChainTable(database) {
  const db = database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS audit_chain (
      sequence_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      source_service TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT '',
      org_id TEXT NOT NULL DEFAULT '',
      user_id TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL DEFAULT 'RISK_SEVERITY_LOW',
      summary TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      previous_hash TEXT NOT NULL DEFAULT '',
      record_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_chain_tenant_time
      ON audit_chain(tenant_id, org_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_chain_type
      ON audit_chain(event_type, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_chain_severity
      ON audit_chain(severity, timestamp DESC);

    CREATE TABLE IF NOT EXISTS audit_retention_configs (
      tenant_id TEXT PRIMARY KEY,
      retention_days INTEGER NOT NULL DEFAULT ${DEFAULT_RETENTION_DAYS},
      archive_before_delete BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT 'system'
    );
  `);
}

/**
 * Compute the hash for an audit record.
 */
function computeRecordHash(record, previousHash) {
  const payload = JSON.stringify({
    eventId: record.eventId,
    eventType: record.eventType,
    timestamp: record.timestamp,
    sourceService: record.sourceService,
    tenantId: record.tenantId ?? "",
    orgId: record.orgId ?? "",
    userId: record.userId ?? "",
    severity: record.severity,
    summary: record.summary,
    payloadJson: record.payloadJson,
    previousHash: previousHash ?? "",
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Append an audit event to the chain with hash linking.
 */
export async function appendToAuditChain(event, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) {
    return { appended: false, reason: "no_database" };
  }

  const record = {
    eventId: event.eventId ?? randomUUID(),
    eventType: String(event.eventType ?? ""),
    timestamp: event.timestamp ?? nowIso(),
    sourceService: String(event.sourceService ?? "gateway-api"),
    tenantId: String(event.tenantId ?? event.context?.tenantId ?? ""),
    orgId: String(event.orgId ?? event.context?.orgId ?? ""),
    userId: String(event.userId ?? event.context?.userId ?? ""),
    severity: String(event.severity ?? "RISK_SEVERITY_LOW"),
    summary: String(event.summary ?? ""),
    payloadJson: typeof event.payloadJson === "string"
      ? event.payloadJson
      : JSON.stringify(event.payload ?? event.payloadJson ?? {}),
  };

  // Use a transaction with FOR UPDATE to prevent concurrent hash chain forks
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const prevResult = await client.query(
      `SELECT record_hash FROM audit_chain ORDER BY sequence_id DESC LIMIT 1 FOR UPDATE`
    );
    const previousHash = prevResult.rows[0]?.record_hash ?? "";

    const recordHash = computeRecordHash(record, previousHash);
    const now = nowIso();

    await client.query(
      `INSERT INTO audit_chain (event_id, event_type, timestamp, source_service, tenant_id, org_id, user_id, severity, summary, payload_json, previous_hash, record_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        record.eventId, record.eventType, record.timestamp, record.sourceService,
        record.tenantId, record.orgId, record.userId, record.severity,
        record.summary, record.payloadJson, previousHash, recordHash, now,
      ]
    );

    await client.query("COMMIT");
    return { appended: true, eventId: record.eventId, recordHash, previousHash };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify the integrity of the audit chain.
 * Returns { valid, checked, firstInvalid, errors }.
 */
export async function verifyAuditChain(options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) {
    return { valid: false, checked: 0, reason: "no_database" };
  }

  const limit = Math.max(1, Math.min(10_000, Number(options.limit) || 1000));
  const result = await db.pool.query(
    `SELECT sequence_id, event_id, event_type, timestamp, source_service, tenant_id, org_id, user_id, severity, summary, payload_json, previous_hash, record_hash
     FROM audit_chain ORDER BY sequence_id ASC LIMIT $1`,
    [limit]
  );

  let previousHash = "";
  let checked = 0;
  const errors = [];

  for (const row of result.rows) {
    checked++;
    const record = {
      eventId: row.event_id,
      eventType: row.event_type,
      timestamp: row.timestamp,
      sourceService: row.source_service,
      tenantId: row.tenant_id,
      orgId: row.org_id,
      userId: row.user_id,
      severity: row.severity,
      summary: row.summary,
      payloadJson: row.payload_json,
    };

    // Verify previous hash link
    if (row.previous_hash !== previousHash) {
      errors.push({
        sequenceId: Number(row.sequence_id),
        eventId: row.event_id,
        error: "previous_hash_mismatch",
        expected: previousHash,
        actual: row.previous_hash,
      });
    }

    // Verify record hash
    const expectedHash = computeRecordHash(record, row.previous_hash);
    if (row.record_hash !== expectedHash) {
      errors.push({
        sequenceId: Number(row.sequence_id),
        eventId: row.event_id,
        error: "record_hash_mismatch",
        expected: expectedHash,
        actual: row.record_hash,
      });
    }

    previousHash = row.record_hash;
  }

  return {
    valid: errors.length === 0,
    checked,
    errors,
    lastHash: previousHash,
  };
}

/**
 * Query the audit chain with filters.
 */
export async function queryAuditChain(filters, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return { events: [], total: 0 };

  const conditions = [];
  const params = [];
  let cursor = 1;

  if (filters.tenantId) {
    conditions.push(`tenant_id = $${cursor++}`);
    params.push(filters.tenantId);
  }
  if (filters.orgId) {
    conditions.push(`org_id = $${cursor++}`);
    params.push(filters.orgId);
  }
  if (filters.eventType) {
    conditions.push(`event_type = $${cursor++}`);
    params.push(filters.eventType);
  }
  if (filters.severity) {
    conditions.push(`severity = $${cursor++}`);
    params.push(filters.severity);
  }
  if (filters.since) {
    conditions.push(`timestamp >= $${cursor++}`);
    params.push(filters.since);
  }
  if (filters.until) {
    conditions.push(`timestamp <= $${cursor++}`);
    params.push(filters.until);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(1000, Number(options.limit) || 100));
  const offset = Math.max(0, Number(options.offset) || 0);

  const countResult = await db.pool.query(
    `SELECT COUNT(*)::int AS total FROM audit_chain ${where}`,
    params
  );

  params.push(limit, offset);
  const result = await db.pool.query(
    `SELECT sequence_id, event_id, event_type, timestamp, source_service, tenant_id, org_id, user_id, severity, summary, payload_json, record_hash, previous_hash, created_at
     FROM audit_chain ${where}
     ORDER BY sequence_id DESC
     LIMIT $${cursor++} OFFSET $${cursor}`,
    params
  );

  return {
    events: result.rows.map((row) => ({
      sequenceId: Number(row.sequence_id),
      eventId: row.event_id,
      eventType: row.event_type,
      timestamp: row.timestamp,
      sourceService: row.source_service,
      tenantId: row.tenant_id,
      orgId: row.org_id,
      userId: row.user_id,
      severity: row.severity,
      summary: row.summary,
      payload: JSON.parse(row.payload_json || "{}"),
      recordHash: row.record_hash,
      previousHash: row.previous_hash,
      createdAt: row.created_at,
    })),
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

// ── Retention Policy ─────────────────────────────────────────────────────────

/**
 * Set retention policy for a tenant.
 */
export async function setRetentionPolicy(tenantId, retentionDays, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return;
  const days = Math.max(7, Math.min(MAX_RETENTION_DAYS, Number(retentionDays) || DEFAULT_RETENTION_DAYS));
  await db.pool.query(
    `INSERT INTO audit_retention_configs (tenant_id, retention_days, archive_before_delete, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id) DO UPDATE SET
       retention_days = EXCLUDED.retention_days,
       archive_before_delete = EXCLUDED.archive_before_delete,
       updated_at = EXCLUDED.updated_at,
       updated_by = EXCLUDED.updated_by`,
    [tenantId, days, options.archiveBeforeDelete !== false, nowIso(), options.updatedBy ?? "system"]
  );
}

/**
 * Get retention policy for a tenant.
 */
export async function getRetentionPolicy(tenantId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) {
    return { retentionDays: DEFAULT_RETENTION_DAYS, archiveBeforeDelete: true };
  }
  const result = await db.pool.query(
    `SELECT retention_days, archive_before_delete FROM audit_retention_configs WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  if (result.rows.length === 0) {
    return { retentionDays: DEFAULT_RETENTION_DAYS, archiveBeforeDelete: true };
  }
  return {
    retentionDays: Number(result.rows[0].retention_days),
    archiveBeforeDelete: Boolean(result.rows[0].archive_before_delete),
  };
}

/**
 * Enforce retention by deleting records older than the retention window.
 * Returns { deleted, archivedCount }.
 */
export async function enforceRetention(options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return { deleted: 0 };

  // Get all tenant retention configs
  const configs = await db.pool.query(`SELECT tenant_id, retention_days FROM audit_retention_configs`);
  let totalDeleted = 0;

  for (const row of configs.rows) {
    const cutoff = new Date(Date.now() - Number(row.retention_days) * 86_400_000).toISOString();
    const result = await db.pool.query(
      `DELETE FROM audit_chain WHERE tenant_id = $1 AND timestamp < $2`,
      [row.tenant_id, cutoff]
    );
    totalDeleted += result.rowCount ?? 0;
  }

  // Also enforce on outbox
  const outboxCutoff = new Date(Date.now() - DEFAULT_RETENTION_DAYS * 86_400_000).toISOString();
  const outboxResult = await db.pool.query(
    `DELETE FROM gateway_audit_outbox WHERE status = 'delivered' AND created_at < $1`,
    [outboxCutoff]
  );
  totalDeleted += outboxResult.rowCount ?? 0;

  if (totalDeleted > 0) {
    mapleLog("info", "audit_retention.enforced", { deleted: totalDeleted });
  }

  return { deleted: totalDeleted };
}
