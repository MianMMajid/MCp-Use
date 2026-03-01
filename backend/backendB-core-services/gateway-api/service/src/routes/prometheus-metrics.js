/**
 * prometheus-metrics.js
 *
 * Prometheus/OpenTelemetry-compatible metrics scrape endpoint.
 * Exposes modifier operational metrics in Prometheus text exposition format.
 */
import { requireApiKeyResponse } from "../auth.js";
import { database, server } from "../state.js";
import { getOutboxHealth } from "../core/audit-outbox.js";

server.app.get("/metrics/modifier", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const lines = [];
  const now = Date.now();

  // Outbox metrics
  try {
    const outbox = await getOutboxHealth({ database });
    lines.push("# HELP maple_modifier_audit_outbox_pending Number of pending audit outbox events");
    lines.push("# TYPE maple_modifier_audit_outbox_pending gauge");
    lines.push(`maple_modifier_audit_outbox_pending ${outbox.pending ?? 0}`);

    lines.push("# HELP maple_modifier_audit_outbox_delivered Total delivered audit outbox events");
    lines.push("# TYPE maple_modifier_audit_outbox_delivered counter");
    lines.push(`maple_modifier_audit_outbox_delivered ${outbox.delivered ?? 0}`);

    lines.push("# HELP maple_modifier_audit_outbox_dead_letter Number of dead-letter audit outbox events");
    lines.push("# TYPE maple_modifier_audit_outbox_dead_letter gauge");
    lines.push(`maple_modifier_audit_outbox_dead_letter ${outbox.deadLetter ?? 0}`);

    lines.push("# HELP maple_modifier_audit_outbox_total Total audit outbox events");
    lines.push("# TYPE maple_modifier_audit_outbox_total counter");
    lines.push(`maple_modifier_audit_outbox_total ${outbox.total ?? 0}`);
  } catch {
    // Outbox not available
  }

  // Approval metrics from DB
  try {
    const approvalResult = await database.pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM gateway_modifier_approvals
      GROUP BY status
    `);
    lines.push("# HELP maple_modifier_approvals_total Approvals by status");
    lines.push("# TYPE maple_modifier_approvals_total gauge");
    for (const row of approvalResult.rows) {
      lines.push(`maple_modifier_approvals_total{status="${row.status}"} ${row.count}`);
    }
  } catch {
    // DB not available
  }

  // Rate limit metrics
  try {
    const quotaResult = await database.pool.query(`
      SELECT scope_key, execution_count, max_executions
      FROM modifier_execution_quotas
      ORDER BY execution_count DESC
      LIMIT 20
    `);
    lines.push("# HELP maple_modifier_quota_usage Execution quota usage by scope");
    lines.push("# TYPE maple_modifier_quota_usage gauge");
    for (const row of quotaResult.rows) {
      const [tenantId, orgId] = (row.scope_key ?? "").split(":");
      lines.push(`maple_modifier_quota_usage{tenant_id="${tenantId ?? ""}",org_id="${orgId ?? ""}"} ${row.execution_count}`);
    }
    lines.push("# HELP maple_modifier_quota_limit Execution quota limit by scope");
    lines.push("# TYPE maple_modifier_quota_limit gauge");
    for (const row of quotaResult.rows) {
      const [tenantId, orgId] = (row.scope_key ?? "").split(":");
      lines.push(`maple_modifier_quota_limit{tenant_id="${tenantId ?? ""}",org_id="${orgId ?? ""}"} ${row.max_executions}`);
    }
  } catch {
    // Rate limiter tables not yet created
  }

  // Break-glass metrics
  try {
    const bgResult = await database.pool.query(`
      SELECT review_status, COUNT(*)::int AS count
      FROM modifier_break_glass_events
      GROUP BY review_status
    `);
    lines.push("# HELP maple_modifier_break_glass_total Break-glass events by review status");
    lines.push("# TYPE maple_modifier_break_glass_total gauge");
    for (const row of bgResult.rows) {
      lines.push(`maple_modifier_break_glass_total{review_status="${row.review_status}"} ${row.count}`);
    }
  } catch {
    // Break-glass table not yet created
  }

  // Audit chain metrics
  try {
    const chainResult = await database.pool.query(`
      SELECT COUNT(*)::int AS total FROM audit_chain
    `);
    lines.push("# HELP maple_modifier_audit_chain_total Total hash-chained audit records");
    lines.push("# TYPE maple_modifier_audit_chain_total counter");
    lines.push(`maple_modifier_audit_chain_total ${chainResult.rows[0]?.total ?? 0}`);
  } catch {
    // Audit chain table not yet created
  }

  // Org hierarchy metrics
  try {
    const orgResult = await database.pool.query(`
      SELECT org_type, COUNT(*)::int AS count
      FROM org_hierarchy WHERE status = 'active'
      GROUP BY org_type
    `);
    lines.push("# HELP maple_modifier_org_nodes Active org hierarchy nodes by type");
    lines.push("# TYPE maple_modifier_org_nodes gauge");
    for (const row of orgResult.rows) {
      lines.push(`maple_modifier_org_nodes{org_type="${row.org_type}"} ${row.count}`);
    }
  } catch {
    // Org hierarchy table not yet created
  }

  // Uptime
  lines.push("# HELP maple_modifier_uptime_seconds Gateway uptime in seconds");
  lines.push("# TYPE maple_modifier_uptime_seconds gauge");
  lines.push(`maple_modifier_uptime_seconds ${Math.floor(process.uptime())}`);

  lines.push("");

  return new Response(lines.join("\n"), {
    status: 200,
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
});
