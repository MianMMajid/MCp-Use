import { requireApiKeyResponse } from "../auth.js";
import { asString } from "../helpers.js";
import { database, server } from "../state.js";
import { getOutboxHealth, replayAuditEvents, flushOutbox } from "../core/audit-outbox.js";
import {
  getOpenClawModifierPolicy,
  listOpenClawModifierApprovals,
  listOpenClawModifierPolicyVersions,
  listOpenClawModifierOrgMembers,
} from "../core/openclaw-modifier-runtime.js";

function actorFromHeaders(c) {
  return {
    tenantId: asString(c.req.header("x-tenant-id")) ?? "",
    orgId: asString(c.req.header("x-org-id")) ?? "",
  };
}

// ── Summary rollup: tenant/org/action health ───────────────────────────────

server.app.get("/api/openclaw/modifier/observability/summary", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = actorFromHeaders(c);
  const [policy, outboxHealth, pendingApprovals, recentApprovals] = await Promise.all([
    getOpenClawModifierPolicy(scope),
    getOutboxHealth({ database }),
    listOpenClawModifierApprovals({ status: "pending", ...scope }),
    listOpenClawModifierApprovals({ ...scope }),
  ]);

  const approvalsByStatus = { pending: 0, approved: 0, rejected: 0, expired: 0 };
  for (const a of recentApprovals) {
    if (approvalsByStatus[a.status] !== undefined) {
      approvalsByStatus[a.status] += 1;
    }
  }

  const toolUsage = {};
  for (const a of recentApprovals) {
    toolUsage[a.tool] = (toolUsage[a.tool] ?? 0) + 1;
  }

  return c.json({
    ok: true,
    scope,
    policy: {
      enabled: policy.enabled,
      policyVersion: policy.policyVersion,
      allowedToolsCount: policy.allowedTools?.length ?? 0,
      dangerousToolsCount: policy.dangerousTools?.length ?? 0,
    },
    approvals: {
      ...approvalsByStatus,
      total: recentApprovals.length,
    },
    toolUsage,
    auditOutbox: outboxHealth,
    timestamp: new Date().toISOString(),
  });
});

// ── Paginated audit log ────────────────────────────────────────────────────

server.app.get("/api/openclaw/modifier/observability/audit-log", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const since = asString(c.req.query("since")) ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const until = asString(c.req.query("until")) ?? new Date().toISOString();
  const status = asString(c.req.query("status")) ?? null;
  const limit = Math.max(1, Math.min(1000, Number(c.req.query("limit")) || 100));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);

  const result = await replayAuditEvents({ since, until, status, limit, offset, database });

  return c.json({
    ok: true,
    ...result,
  });
});

// ── SLO signals ────────────────────────────────────────────────────────────

server.app.get("/api/openclaw/modifier/observability/slo", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = actorFromHeaders(c);
  const windowMs = Math.max(
    60_000,
    Math.min(86_400_000, Number(c.req.query("windowMs")) || 3_600_000)
  );
  const since = new Date(Date.now() - windowMs).toISOString();

  const [outboxHealth, recentApprovals] = await Promise.all([
    getOutboxHealth({ database }),
    listOpenClawModifierApprovals({ ...scope }),
  ]);

  // Filter to window
  const windowApprovals = recentApprovals.filter(
    (a) => a.createdAt >= since
  );

  const total = windowApprovals.length;
  const approved = windowApprovals.filter((a) => a.status === "approved").length;
  const rejected = windowApprovals.filter((a) => a.status === "rejected").length;
  const expired = windowApprovals.filter((a) => a.status === "expired").length;
  const pending = windowApprovals.filter((a) => a.status === "pending").length;

  // Approval latency (decided - created) for resolved approvals
  const resolvedApprovals = windowApprovals.filter(
    (a) => a.decidedAt && (a.status === "approved" || a.status === "rejected")
  );
  const latencies = resolvedApprovals
    .map((a) => new Date(a.decidedAt).getTime() - new Date(a.createdAt).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0);

  const avgLatencyMs = latencies.length > 0 ? latencies.reduce((s, v) => s + v, 0) / latencies.length : null;
  const p95LatencyMs = latencies.length > 0
    ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] ?? null
    : null;

  const auditDeliveryRate = outboxHealth.total > 0
    ? outboxHealth.delivered / outboxHealth.total
    : 1.0;

  return c.json({
    ok: true,
    scope,
    window: {
      since,
      until: new Date().toISOString(),
      windowMs,
    },
    approvals: {
      total,
      approved,
      rejected,
      expired,
      pending,
      approvalRate: total > 0 ? approved / total : null,
    },
    latency: {
      avgMs: avgLatencyMs,
      p95Ms: p95LatencyMs,
      sampleSize: latencies.length,
    },
    auditDelivery: {
      rate: auditDeliveryRate,
      pending: outboxHealth.pending ?? 0,
      deadLetter: outboxHealth.deadLetter ?? 0,
      healthy: (outboxHealth.deadLetter ?? 0) === 0 && (outboxHealth.pending ?? 0) < 100,
    },
    timestamp: new Date().toISOString(),
  });
});

// ── SIEM export ────────────────────────────────────────────────────────────

server.app.post("/api/openclaw/modifier/observability/siem-export", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  let body;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const since = asString(body.since) ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const until = asString(body.until) ?? new Date().toISOString();
  const format = asString(body.format) ?? "json";
  const limit = Math.max(1, Math.min(5000, Number(body.limit) || 1000));

  const result = await replayAuditEvents({
    since,
    until,
    status: "delivered",
    limit,
    offset: 0,
    database,
  });

  if (format === "ndjson") {
    const lines = result.events.map((e) => JSON.stringify(e)).join("\n");
    return new Response(lines + "\n", {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "X-Total-Count": String(result.total),
      },
    });
  }

  return c.json({
    ok: true,
    format: "json",
    events: result.events,
    total: result.total,
    since,
    until,
    exportedAt: new Date().toISOString(),
  });
});

// ── Manual flush trigger ───────────────────────────────────────────────────

server.app.post("/api/openclaw/modifier/observability/flush", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const result = await flushOutbox({ database });
  return c.json({
    ok: true,
    ...result,
    flushedAt: new Date().toISOString(),
  });
});

// ── Org RBAC + policy introspection (observability-oriented) ───────────────

server.app.get("/api/openclaw/modifier/observability/org", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;

  const scope = actorFromHeaders(c);
  try {
    const [members, policyVersions] = await Promise.all([
      listOpenClawModifierOrgMembers(scope),
      listOpenClawModifierPolicyVersions(scope, { limit: 10 }),
    ]);

    return c.json({
      ok: true,
      scope,
      members: members ?? [],
      policyVersions: policyVersions ?? [],
    });
  } catch (err) {
    return c.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      403
    );
  }
});
