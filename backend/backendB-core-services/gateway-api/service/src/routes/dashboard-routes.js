/**
 * dashboard-routes.js
 *
 * Phase 8: Customizable dashboard layout persistence and widget data
 * aggregation. Each user can save their own dashboard layout; the
 * widgets/data endpoint returns live data for all supported widget types.
 *
 * GET    /api/dashboard/layout        — get current user's dashboard layout
 * PUT    /api/dashboard/layout        — save dashboard layout
 * DELETE /api/dashboard/layout        — reset to default
 * GET    /api/dashboard/widgets/data  — aggregate data for all widget types
 */
import { requireApiKeyResponse, getAuthContext } from "../auth-api-key.js";
import { database } from "../state.js";
import { readJsonBody } from "../helpers.js";
import { mapleLog } from "../logging.js";

// ── Table bootstrap ─────────────────────────────────────────────────────────

async function ensureDashboardLayoutsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_layouts (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL UNIQUE,
      layout_json TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

let _tableEnsured = false;

// ── Default layout ──────────────────────────────────────────────────────────

const DEFAULT_LAYOUT = {
  version: 1,
  columns: 3,
  widgets: [
    { id: "risk-score",      type: "risk_score",      position: { x: 0, y: 0, w: 1, h: 1 }, visible: true },
    { id: "traces-count",    type: "traces_count",    position: { x: 1, y: 0, w: 1, h: 1 }, visible: true },
    { id: "approvals-count", type: "approvals_count", position: { x: 2, y: 0, w: 1, h: 1 }, visible: true },
    { id: "block-rate",      type: "block_rate",      position: { x: 0, y: 1, w: 1, h: 1 }, visible: true },
    { id: "recent-audit",    type: "recent_audit",    position: { x: 1, y: 1, w: 2, h: 1 }, visible: true },
    { id: "slo-status",      type: "slo_status",      position: { x: 0, y: 2, w: 1, h: 1 }, visible: true },
    { id: "agent-activity",  type: "agent_activity",  position: { x: 1, y: 2, w: 2, h: 1 }, visible: true },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveUserId(c) {
  const authCtx = getAuthContext(c);
  if (authCtx?.userId) return authCtx.userId;
  // For API key or bypass auth without user binding, use a deterministic fallback
  if (authCtx?.authBypass || authCtx?.method === "api_key" || authCtx?.method === "bypass") {
    return authCtx?.keyFingerprint || "default-user";
  }
  return null;
}

async function safeQuery(pool, sql, params = []) {
  try {
    return (await pool.query(sql, params)).rows;
  } catch {
    return [];
  }
}

/**
 * Collect data for every supported widget type in parallel.
 */
async function aggregateWidgetData(pool) {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  const [
    riskRows,
    traceRows,
    approvalRows,
    blockRows,
    auditRows,
    sloRows,
    agentRows,
  ] = await Promise.all([
    // Risk score — lightweight re-computation
    safeQuery(pool,
      `SELECT
         (SELECT COUNT(*) FILTER (WHERE enabled = TRUE) FROM firewall_rules)::int AS enabled_rules,
         (SELECT COUNT(*) FROM firewall_rules)::int AS total_rules,
         (SELECT COUNT(DISTINCT user_id) FROM user_mfa_methods WHERE verified = TRUE)::int AS mfa_users,
         (SELECT COUNT(*) FROM business_users)::int AS total_users`
    ),

    // Traces count (last 24h and 7d)
    safeQuery(pool,
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= $1)::int AS last_24h,
         COUNT(*) FILTER (WHERE created_at >= $2)::int AS last_7d,
         COUNT(*)::int AS total
       FROM traces`,
      [oneDayAgo, sevenDaysAgo]
    ),

    // Approvals count
    safeQuery(pool,
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
         COUNT(*) FILTER (WHERE status = 'denied')::int AS denied,
         COUNT(*)::int AS total
       FROM hitl_approval_queue`
    ),

    // Block rate (last 30d)
    safeQuery(pool,
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE event_type ILIKE '%BLOCK%' OR event_type ILIKE '%DENIED%')::int AS blocked
       FROM audit_events
       WHERE timestamp >= $1`,
      [thirtyDaysAgo]
    ),

    // Recent audit events (last 20)
    safeQuery(pool,
      `SELECT event_id, event_type, timestamp, source_service, severity, summary
       FROM audit_events
       ORDER BY timestamp DESC
       LIMIT 20`
    ),

    // SLO status — trace latency p95 over last 24h
    safeQuery(pool,
      `SELECT
         COUNT(*)::int AS total_traces,
         PERCENTILE_CONT(0.95) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at))
         ) AS p95_latency_s
       FROM traces
       WHERE created_at >= $1`,
      [oneDayAgo]
    ),

    // Agent activity (last 7d)
    safeQuery(pool,
      `SELECT
         COUNT(*)::int AS total_agents,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active_agents,
         COUNT(*) FILTER (WHERE updated_at >= $1)::int AS recently_active
       FROM agents`,
      [sevenDaysAgo]
    ),
  ]);

  // Compute risk score
  const enabledRules = riskRows[0]?.enabled_rules ?? 0;
  const totalRules = riskRows[0]?.total_rules ?? 0;
  const mfaUsers = riskRows[0]?.mfa_users ?? 0;
  const totalUsers = riskRows[0]?.total_users ?? 0;
  const fwScore = totalRules > 0 ? Math.round((enabledRules / totalRules) * 100) : 0;
  const mfaScore = totalUsers > 0 ? Math.round((mfaUsers / totalUsers) * 100) : 50;
  const riskScore = Math.round(fwScore * 0.5 + mfaScore * 0.5);

  // Block rate
  const blockTotal = blockRows[0]?.total ?? 0;
  const blockBlocked = blockRows[0]?.blocked ?? 0;
  const blockRate = blockTotal > 0 ? Math.round((blockBlocked / blockTotal) * 100) : 0;

  // SLO
  const p95 = sloRows[0]?.p95_latency_s ?? null;
  const sloTarget = 2.0; // 2-second p95 target
  const sloMet = p95 !== null ? p95 <= sloTarget : null;

  return {
    risk_score: {
      score: riskScore,
      enabledRules,
      totalRules,
      mfaUsers,
      totalUsers,
    },
    traces_count: {
      last24h: traceRows[0]?.last_24h ?? 0,
      last7d: traceRows[0]?.last_7d ?? 0,
      total: traceRows[0]?.total ?? 0,
    },
    approvals_count: {
      pending: approvalRows[0]?.pending ?? 0,
      approved: approvalRows[0]?.approved ?? 0,
      denied: approvalRows[0]?.denied ?? 0,
      total: approvalRows[0]?.total ?? 0,
    },
    block_rate: {
      rate: blockRate,
      blocked: blockBlocked,
      total: blockTotal,
      window: "30d",
    },
    recent_audit: {
      events: auditRows.map((e) => ({
        eventId: e.event_id,
        eventType: e.event_type,
        timestamp: e.timestamp,
        sourceService: e.source_service,
        severity: e.severity,
        summary: e.summary,
      })),
    },
    slo_status: {
      p95LatencySeconds: p95 !== null ? Number(Number(p95).toFixed(3)) : null,
      targetSeconds: sloTarget,
      met: sloMet,
      tracesEvaluated: sloRows[0]?.total_traces ?? 0,
      window: "24h",
    },
    agent_activity: {
      totalAgents: agentRows[0]?.total_agents ?? 0,
      activeAgents: agentRows[0]?.active_agents ?? 0,
      recentlyActive: agentRows[0]?.recently_active ?? 0,
      window: "7d",
    },
  };
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerDashboardRoutes(app) {
  // ── Get current user's dashboard layout ───────────────────────────────
  app.get("/api/dashboard/layout", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureDashboardLayoutsTable(pool); _tableEnsured = true; }

    const userId = resolveUserId(c);
    if (!userId) return c.json({ error: "User identity required." }, 403);

    try {
      const result = await pool.query(
        `SELECT layout_json, updated_at FROM dashboard_layouts WHERE user_id = $1 LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return c.json({ ok: true, layout: DEFAULT_LAYOUT, isDefault: true });
      }

      const layout = JSON.parse(result.rows[0].layout_json || "{}");
      return c.json({
        ok: true,
        layout,
        isDefault: false,
        updatedAt: result.rows[0].updated_at,
      });
    } catch (err) {
      mapleLog("error", "dashboard.layout_get_failed", { userId, error: err.message });
      return c.json({ error: "Failed to get dashboard layout", details: err.message }, 500);
    }
  });

  // ── Save dashboard layout ─────────────────────────────────────────────
  app.put("/api/dashboard/layout", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureDashboardLayoutsTable(pool); _tableEnsured = true; }

    const userId = resolveUserId(c);
    if (!userId) return c.json({ error: "User identity required." }, 403);

    const body = await readJsonBody(c);
    const layout = body.layout || body;

    if (!layout || typeof layout !== "object") {
      return c.json({ error: "layout object is required in request body." }, 400);
    }

    try {
      const layoutStr = JSON.stringify(layout);
      await pool.query(
        `INSERT INTO dashboard_layouts (user_id, layout_json)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           layout_json = EXCLUDED.layout_json,
           updated_at = NOW()`,
        [userId, layoutStr]
      );

      mapleLog("info", "dashboard.layout_saved", { userId });

      return c.json({ ok: true, layout, updatedAt: new Date().toISOString() });
    } catch (err) {
      mapleLog("error", "dashboard.layout_save_failed", { userId, error: err.message });
      return c.json({ error: "Failed to save dashboard layout", details: err.message }, 500);
    }
  });

  // ── Reset to default layout ───────────────────────────────────────────
  app.delete("/api/dashboard/layout", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureDashboardLayoutsTable(pool); _tableEnsured = true; }

    const userId = resolveUserId(c);
    if (!userId) return c.json({ error: "User identity required." }, 403);

    try {
      await pool.query(
        `DELETE FROM dashboard_layouts WHERE user_id = $1`,
        [userId]
      );

      mapleLog("info", "dashboard.layout_reset", { userId });

      return c.json({ ok: true, layout: DEFAULT_LAYOUT, isDefault: true });
    } catch (err) {
      mapleLog("error", "dashboard.layout_reset_failed", { userId, error: err.message });
      return c.json({ error: "Failed to reset dashboard layout", details: err.message }, 500);
    }
  });

  // ── Aggregate widget data ─────────────────────────────────────────────
  app.get("/api/dashboard/widgets/data", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    try {
      const widgets = await aggregateWidgetData(pool);

      return c.json({
        ok: true,
        widgets,
        computedAt: new Date().toISOString(),
      });
    } catch (err) {
      mapleLog("error", "dashboard.widgets_data_failed", { error: err.message });
      return c.json({ error: "Failed to aggregate widget data", details: err.message }, 500);
    }
  });
}
