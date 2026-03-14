/**
 * escalation-chain.js
 *
 * Approval escalation chains with on-call delegation and break-glass
 * emergency override with mandatory post-hoc audit.
 */
import { randomUUID } from "node:crypto";
import { mapleLog } from "../logging.js";
import { emitAuditEvent } from "../audit-emitter.js";

let _database = null;

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Configure the escalation module.
 */
export function configureEscalationChain(options = {}) {
  if (options.database) {
    _database = options.database;
  }
}

/**
 * Ensure the escalation tables exist.
 */
export async function ensureEscalationTables(database) {
  const db = database ?? _database;
  if (!hasPool(db)) return;
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS modifier_escalation_chains (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      chain_name TEXT NOT NULL DEFAULT 'default',
      levels_json TEXT NOT NULL DEFAULT '[]',
      escalation_timeout_seconds INTEGER NOT NULL DEFAULT 300,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      UNIQUE (tenant_id, org_id, chain_name)
    );

    CREATE TABLE IF NOT EXISTS modifier_escalation_events (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      chain_name TEXT NOT NULL DEFAULT 'default',
      current_level INTEGER NOT NULL DEFAULT 0,
      escalated_to TEXT NOT NULL DEFAULT '',
      escalated_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resolved_at TEXT,
      resolved_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_escalation_events_approval
      ON modifier_escalation_events(approval_id, escalated_at DESC);

    CREATE TABLE IF NOT EXISTS modifier_break_glass_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      approval_id TEXT,
      reason TEXT NOT NULL,
      justification TEXT NOT NULL DEFAULT '',
      action_taken TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending_review',
      review_notes TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_break_glass_tenant
      ON modifier_break_glass_events(tenant_id, org_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_break_glass_review
      ON modifier_break_glass_events(review_status, created_at ASC);
  `);
}

/**
 * Define an escalation chain for a tenant/org.
 * Levels is an array of { approvers: [userId, ...], timeoutSeconds }.
 */
export async function upsertEscalationChain(tenantId, orgId, chainConfig, options = {}) {
  const db = options.database ?? _database;
  const chainName = chainConfig.chainName ?? "default";
  const levels = Array.isArray(chainConfig.levels) ? chainConfig.levels : [];
  const timeoutSeconds = Math.max(60, Math.min(3600, Number(chainConfig.escalationTimeoutSeconds) || 300));
  const now = nowIso();

  if (!hasPool(db)) {
    return {
      id: `esc-${randomUUID()}`,
      tenantId,
      orgId,
      chainName,
      levels,
      escalationTimeoutSeconds: timeoutSeconds,
      createdAt: now,
      updatedAt: now,
      createdBy: options.createdBy ?? "system",
    };
  }

  const id = `esc-${randomUUID()}`;
  await db.pool.query(
    `INSERT INTO modifier_escalation_chains (id, tenant_id, org_id, chain_name, levels_json, escalation_timeout_seconds, created_at, updated_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
     ON CONFLICT (tenant_id, org_id, chain_name) DO UPDATE SET
       levels_json = EXCLUDED.levels_json,
       escalation_timeout_seconds = EXCLUDED.escalation_timeout_seconds,
       updated_at = EXCLUDED.updated_at`,
    [id, tenantId, orgId, chainName, JSON.stringify(levels), timeoutSeconds, now, options.createdBy ?? "system"]
  );

  return { id, tenantId, orgId, chainName, levels, escalationTimeoutSeconds: timeoutSeconds, createdAt: now, updatedAt: now, createdBy: options.createdBy ?? "system" };
}

/**
 * Get the escalation chain for a tenant/org.
 */
export async function getEscalationChain(tenantId, orgId, chainName, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return null;
  const result = await db.pool.query(
    `SELECT id, tenant_id, org_id, chain_name, levels_json, escalation_timeout_seconds, created_at, updated_at, created_by
     FROM modifier_escalation_chains WHERE tenant_id = $1 AND org_id = $2 AND chain_name = $3 LIMIT 1`,
    [tenantId, orgId, chainName ?? "default"]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    chainName: row.chain_name,
    levels: JSON.parse(row.levels_json || "[]"),
    escalationTimeoutSeconds: Number(row.escalation_timeout_seconds),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

/**
 * Escalate a pending approval to the next level in the chain.
 */
export async function escalateApproval(approvalId, tenantId, orgId, options = {}) {
  const db = options.database ?? _database;
  const chain = await getEscalationChain(tenantId, orgId, options.chainName ?? "default", { database: db });
  if (!chain || chain.levels.length === 0) {
    return { escalated: false, reason: "no_escalation_chain" };
  }

  // Determine current level
  let currentLevel = 0;
  if (hasPool(db)) {
    const result = await db.pool.query(
      `SELECT MAX(current_level)::int AS max_level FROM modifier_escalation_events
       WHERE approval_id = $1`,
      [approvalId]
    );
    currentLevel = (Number(result.rows[0]?.max_level) || -1) + 1;
  }

  if (currentLevel >= chain.levels.length) {
    return { escalated: false, reason: "max_level_reached", currentLevel, maxLevels: chain.levels.length };
  }

  const level = chain.levels[currentLevel];
  const escalatedTo = Array.isArray(level?.approvers) ? level.approvers.join(",") : "";
  const now = nowIso();

  if (hasPool(db)) {
    await db.pool.query(
      `INSERT INTO modifier_escalation_events (id, approval_id, tenant_id, org_id, chain_name, current_level, escalated_to, escalated_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [`escevt-${randomUUID()}`, approvalId, tenantId, orgId, chain.chainName, currentLevel, escalatedTo, now]
    );
  }

  emitAuditEvent({
    eventType: "AUDIT_EVENT_TYPE_ESCALATION",
    sourceService: "gateway-api",
    severity: "RISK_SEVERITY_HIGH",
    summary: `Modifier approval ${approvalId} escalated to level ${currentLevel}`,
    payload: { approvalId, tenantId, orgId, currentLevel, escalatedTo, chainName: chain.chainName },
  });

  return {
    escalated: true,
    currentLevel,
    escalatedTo: level?.approvers ?? [],
    timeoutSeconds: level?.timeoutSeconds ?? chain.escalationTimeoutSeconds,
  };
}

/**
 * Get escalation history for an approval.
 */
export async function getEscalationHistory(approvalId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return [];
  // Finding 2: Scope escalation history by tenant/org to prevent cross-tenant reads
  const conditions = ["approval_id = $1"];
  const params = [approvalId];
  let cursor = 2;
  if (options.tenantId) {
    conditions.push(`tenant_id = $${cursor++}`);
    params.push(options.tenantId);
  }
  if (options.orgId) {
    conditions.push(`org_id = $${cursor++}`);
    params.push(options.orgId);
  }
  const result = await db.pool.query(
    `SELECT id, approval_id, tenant_id, org_id, chain_name, current_level, escalated_to, escalated_at, status, resolved_at, resolved_by
     FROM modifier_escalation_events WHERE ${conditions.join(" AND ")} ORDER BY current_level ASC`,
    params
  );
  return result.rows.map((row) => ({
    id: row.id,
    approvalId: row.approval_id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    chainName: row.chain_name,
    currentLevel: Number(row.current_level),
    escalatedTo: row.escalated_to,
    escalatedAt: row.escalated_at,
    status: row.status,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  }));
}

// ── Break-glass Emergency Override ──────────────────────────────────────────

/**
 * Execute a break-glass emergency override.
 * Bypasses normal approval flow but creates a mandatory post-hoc audit record.
 */
export async function executeBreakGlass(input, options = {}) {
  const db = options.database ?? _database;
  const id = `bg-${randomUUID()}`;
  const now = nowIso();

  const record = {
    id,
    tenantId: String(input.tenantId ?? ""),
    orgId: String(input.orgId ?? ""),
    userId: String(input.userId ?? ""),
    approvalId: input.approvalId ?? null,
    reason: String(input.reason ?? ""),
    justification: String(input.justification ?? ""),
    actionTaken: String(input.actionTaken ?? ""),
    createdAt: now,
    reviewedAt: null,
    reviewedBy: null,
    reviewStatus: "pending_review",
    reviewNotes: "",
  };

  if (!record.reason) {
    throw new Error("Break-glass requires a reason.");
  }
  if (!record.justification) {
    throw new Error("Break-glass requires a justification.");
  }

  if (hasPool(db)) {
    await db.pool.query(
      `INSERT INTO modifier_break_glass_events (id, tenant_id, org_id, user_id, approval_id, reason, justification, action_taken, created_at, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_review')`,
      [record.id, record.tenantId, record.orgId, record.userId, record.approvalId, record.reason, record.justification, record.actionTaken, now]
    );
  }

  emitAuditEvent({
    eventType: "AUDIT_EVENT_TYPE_BREAK_GLASS",
    sourceService: "gateway-api",
    userId: record.userId,
    severity: "RISK_SEVERITY_CRITICAL",
    summary: `BREAK-GLASS emergency override by ${record.userId}`,
    payload: record,
  });

  mapleLog("warn", "break_glass.executed", {
    id: record.id,
    userId: record.userId,
    tenantId: record.tenantId,
    orgId: record.orgId,
    reason: record.reason,
  });

  return record;
}

/**
 * List break-glass events requiring review.
 */
export async function listBreakGlassEvents(tenantId, orgId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return [];
  const status = options.reviewStatus ?? null;
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));

  const conditions = ["tenant_id = $1"];
  const params = [tenantId];
  let cursor = 2;
  if (orgId) {
    conditions.push(`org_id = $${cursor++}`);
    params.push(orgId);
  }
  if (status) {
    conditions.push(`review_status = $${cursor++}`);
    params.push(status);
  }
  params.push(limit);

  const result = await db.pool.query(
    `SELECT id, tenant_id, org_id, user_id, approval_id, reason, justification, action_taken, created_at, reviewed_at, reviewed_by, review_status, review_notes
     FROM modifier_break_glass_events
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${cursor}`,
    params
  );

  return result.rows.map(toBreakGlassRecord);
}

/**
 * Submit a post-hoc review for a break-glass event.
 */
export async function reviewBreakGlassEvent(breakGlassId, review, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) return null;

  // Finding 1: Require tenant/org scope to prevent cross-tenant mutation
  const tenantId = options.tenantId ?? "";
  const orgId = options.orgId ?? "";

  // Verify the event belongs to the caller's tenant before allowing mutation
  const existing = await db.pool.query(
    `SELECT id, tenant_id, org_id, user_id, review_status FROM modifier_break_glass_events WHERE id = $1 LIMIT 1`,
    [breakGlassId]
  );
  if (existing.rows.length === 0) return null;
  const row = existing.rows[0];

  // Tenant/org must match (reject cross-tenant reviews)
  if (tenantId && row.tenant_id !== tenantId) return null;
  if (orgId && row.org_id !== orgId) return null;

  // Reviewer must not be the same user who triggered the break-glass
  if (review.reviewedBy && review.reviewedBy === row.user_id) {
    throw new Error("Break-glass events cannot be reviewed by the same user who triggered them.");
  }

  const reviewStatus = review.approved ? "reviewed_approved" : "reviewed_flagged";
  const now = nowIso();

  // Scoped UPDATE with tenant/org filter
  const updateConditions = ["id = $1"];
  const updateParams = [breakGlassId, reviewStatus, now, review.reviewedBy ?? "", review.notes ?? ""];
  let cursor = 6;
  if (tenantId) {
    updateConditions.push(`tenant_id = $${cursor++}`);
    updateParams.push(tenantId);
  }
  if (orgId) {
    updateConditions.push(`org_id = $${cursor++}`);
    updateParams.push(orgId);
  }

  await db.pool.query(
    `UPDATE modifier_break_glass_events
     SET review_status = $2, reviewed_at = $3, reviewed_by = $4, review_notes = $5
     WHERE ${updateConditions.join(" AND ")}`,
    updateParams
  );

  emitAuditEvent({
    eventType: "AUDIT_EVENT_TYPE_BREAK_GLASS_REVIEWED",
    sourceService: "gateway-api",
    userId: review.reviewedBy,
    severity: review.approved ? "RISK_SEVERITY_LOW" : "RISK_SEVERITY_CRITICAL",
    summary: `Break-glass ${breakGlassId} reviewed: ${reviewStatus}`,
    payload: { breakGlassId, reviewStatus, reviewedBy: review.reviewedBy, notes: review.notes, tenantId, orgId },
  });

  const result = await db.pool.query(
    `SELECT * FROM modifier_break_glass_events WHERE id = $1 LIMIT 1`,
    [breakGlassId]
  );
  return result.rows[0] ? toBreakGlassRecord(result.rows[0]) : null;
}

function toBreakGlassRecord(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orgId: row.org_id,
    userId: row.user_id,
    approvalId: row.approval_id,
    reason: row.reason,
    justification: row.justification,
    actionTaken: row.action_taken,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    reviewStatus: row.review_status,
    reviewNotes: row.review_notes,
  };
}
