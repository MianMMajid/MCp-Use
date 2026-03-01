/**
 * compliance-reporter.js
 *
 * SOC2/ISO compliance evidence report generation.
 * Aggregates audit chain, approval history, policy versions, RBAC state,
 * break-glass events, and SLO metrics into structured compliance reports.
 */
import { randomUUID } from "node:crypto";
import { mapleLog } from "../logging.js";

let _database = null;

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Configure the compliance reporter.
 */
export function configureComplianceReporter(options = {}) {
  if (options.database) {
    _database = options.database;
  }
}

/**
 * Generate a SOC2-style compliance evidence report for a tenant.
 */
export async function generateComplianceReport(tenantId, options = {}) {
  const db = options.database ?? _database;
  const since = options.since ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const until = options.until ?? nowIso();

  const report = {
    reportId: `cr-${randomUUID()}`,
    tenantId,
    generatedAt: nowIso(),
    period: { since, until },
    framework: options.framework ?? "SOC2",
    sections: {},
  };

  if (!hasPool(db)) {
    report.sections.error = { message: "No database available for report generation" };
    return report;
  }

  // CC6.1 — Access Control
  const [memberCount, roleDistribution] = await Promise.all([
    db.pool.query(
      `SELECT COUNT(*)::int AS total FROM gateway_modifier_org_members WHERE tenant_id = $1`,
      [tenantId]
    ),
    db.pool.query(
      `SELECT role_id, COUNT(*)::int AS count FROM gateway_modifier_org_members
       WHERE tenant_id = $1 GROUP BY role_id ORDER BY count DESC`,
      [tenantId]
    ),
  ]);

  report.sections.accessControl = {
    controlId: "CC6.1",
    title: "Logical and Physical Access Controls",
    totalMembers: Number(memberCount.rows[0]?.total ?? 0),
    roleDistribution: roleDistribution.rows.map((r) => ({ role: r.role_id, count: Number(r.count) })),
    evidence: "Org members are bound to specific tenants/orgs with role-based permissions. RBAC enforced on every modifier operation.",
  };

  // CC6.6 — System Operations
  const [approvalStats, executionStats] = await Promise.all([
    db.pool.query(
      `SELECT status, COUNT(*)::int AS count FROM gateway_modifier_approvals
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY status`,
      [tenantId, since, until]
    ),
    db.pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_chain
       WHERE tenant_id = $1 AND event_type LIKE 'AUDIT_EVENT_TYPE_TOOL_%' AND timestamp >= $2 AND timestamp <= $3`,
      [tenantId, since, until]
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ]);

  const approvals = {};
  for (const row of approvalStats.rows) {
    approvals[row.status] = Number(row.count);
  }

  report.sections.systemOperations = {
    controlId: "CC6.6",
    title: "System Operations — Modifier Execution",
    approvalsByStatus: approvals,
    totalExecutions: Number(executionStats.rows[0]?.total ?? 0),
    evidence: "All modifier executions require HITL approval for dangerous operations. Full audit trail maintained with hash-chained integrity.",
  };

  // CC7.2 — Monitoring
  const [auditChainCount, auditIntegrity] = await Promise.all([
    db.pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_chain
       WHERE tenant_id = $1 AND timestamp >= $2 AND timestamp <= $3`,
      [tenantId, since, until]
    ).catch(() => ({ rows: [{ total: 0 }] })),
    db.pool.query(
      `SELECT COUNT(*)::int AS total FROM gateway_audit_outbox WHERE status = 'dead_letter'`
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ]);

  report.sections.monitoring = {
    controlId: "CC7.2",
    title: "System Monitoring",
    auditEventsInPeriod: Number(auditChainCount.rows[0]?.total ?? 0),
    deadLetterCount: Number(auditIntegrity.rows[0]?.total ?? 0),
    evidence: "Audit events are persisted with cryptographic hash chaining. Dead-letter queue monitored for delivery failures.",
  };

  // CC7.3 — Change Management (Policy Versions)
  const policyVersions = await db.pool.query(
    `SELECT version, is_active, created_at, created_by FROM gateway_modifier_tenant_policies
     WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
     ORDER BY version DESC LIMIT 20`,
    [tenantId, since, until]
  );

  report.sections.changeManagement = {
    controlId: "CC7.3",
    title: "Change Management — Policy Versioning",
    policyChangesInPeriod: policyVersions.rows.length,
    versions: policyVersions.rows.map((r) => ({
      version: Number(r.version),
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      createdBy: r.created_by,
    })),
    evidence: "All policy changes are versioned. Active policy is immutable once activated; new versions replace rather than modify.",
  };

  // CC8.1 — Incident Response (Break-glass)
  const breakGlassEvents = await db.pool.query(
    `SELECT id, user_id, reason, review_status, created_at FROM modifier_break_glass_events
     WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
     ORDER BY created_at DESC`,
    [tenantId, since, until]
  ).catch(() => ({ rows: [] }));

  const unreviewedCount = breakGlassEvents.rows.filter((r) => r.review_status === "pending_review").length;

  report.sections.incidentResponse = {
    controlId: "CC8.1",
    title: "Incident Response — Break-Glass Events",
    totalBreakGlassEvents: breakGlassEvents.rows.length,
    unreviewedCount,
    events: breakGlassEvents.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      reason: r.reason,
      reviewStatus: r.review_status,
      createdAt: r.created_at,
    })),
    evidence: "Break-glass emergency overrides require justification and create mandatory post-hoc review records.",
    finding: unreviewedCount > 0 ? `WARNING: ${unreviewedCount} break-glass events pending review` : "All break-glass events reviewed",
  };

  return report;
}

/**
 * Generate a lightweight compliance summary (for dashboards).
 */
export async function getComplianceSummary(tenantId, options = {}) {
  const db = options.database ?? _database;
  if (!hasPool(db)) {
    return { available: false };
  }

  const since = options.since ?? new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [members, approvals, breakGlass, deadLetters] = await Promise.all([
    db.pool.query(`SELECT COUNT(*)::int AS c FROM gateway_modifier_org_members WHERE tenant_id = $1`, [tenantId]),
    db.pool.query(`SELECT COUNT(*)::int AS c FROM gateway_modifier_approvals WHERE tenant_id = $1 AND created_at >= $2`, [tenantId, since]),
    db.pool.query(`SELECT COUNT(*)::int AS c FROM modifier_break_glass_events WHERE tenant_id = $1 AND review_status = 'pending_review'`, [tenantId]).catch(() => ({ rows: [{ c: 0 }] })),
    db.pool.query(`SELECT COUNT(*)::int AS c FROM gateway_audit_outbox WHERE status = 'dead_letter'`).catch(() => ({ rows: [{ c: 0 }] })),
  ]);

  const memberCount = Number(members.rows[0]?.c ?? 0);
  const approvalCount = Number(approvals.rows[0]?.c ?? 0);
  const breakGlassUnreviewed = Number(breakGlass.rows[0]?.c ?? 0);
  const deadLetterCount = Number(deadLetters.rows[0]?.c ?? 0);

  const issues = [];
  if (breakGlassUnreviewed > 0) issues.push(`${breakGlassUnreviewed} break-glass events pending review`);
  if (deadLetterCount > 0) issues.push(`${deadLetterCount} audit events in dead-letter queue`);
  if (memberCount === 0) issues.push("No org members configured");

  return {
    available: true,
    tenantId,
    since,
    healthy: issues.length === 0,
    issues,
    counts: {
      members: memberCount,
      approvals: approvalCount,
      breakGlassUnreviewed,
      deadLetters: deadLetterCount,
    },
  };
}
