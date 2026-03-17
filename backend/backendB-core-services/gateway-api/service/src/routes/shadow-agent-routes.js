/**
 * shadow-agent-routes.js
 *
 * Phase 6C: Shadow (unregistered) agent detection. Cross-references
 * agent identifiers observed in trace/audit data with the registered
 * agent inventory. Surfaces unknown agents and allows operators to
 * acknowledge or block them.
 *
 * GET  /api/shadow-agents                       — list detected shadow agents
 * POST /api/shadow-agents/:agentId/acknowledge  — acknowledge a shadow agent
 * POST /api/shadow-agents/:agentId/block        — block a shadow agent
 */
import { requireApiKeyResponse, getAuthContext } from "../auth-api-key.js";
import { database } from "../state.js";
import { asString, readJsonBody } from "../helpers.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog } from "../logging.js";

// ── Table bootstrap ─────────────────────────────────────────────────────────

async function ensureShadowAgentsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shadow_agents (
      agent_id TEXT PRIMARY KEY,
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_seen TIMESTAMPTZ DEFAULT NOW(),
      occurrence_count INTEGER DEFAULT 1,
      source TEXT DEFAULT 'audit',
      status TEXT NOT NULL DEFAULT 'detected'
        CHECK (status IN ('detected', 'acknowledged', 'blocked')),
      acknowledged_by TEXT,
      acknowledged_at TIMESTAMPTZ,
      blocked_by TEXT,
      blocked_at TIMESTAMPTZ,
      metadata_json TEXT DEFAULT '{}'
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_shadow_agents_status ON shadow_agents(status)
  `);
}

let _tableEnsured = false;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Discover agent IDs appearing in audit events / traces that are not
 * registered in the agents table. Merge findings into shadow_agents.
 */
async function discoverShadowAgents(pool) {
  // Gather distinct agent IDs from audit events (payload may contain agentId)
  const auditAgents = await pool.query(`
    SELECT DISTINCT
      COALESCE(
        payload_json::json->>'agentId',
        payload_json::json->>'agent_id',
        payload_json::json->>'sourceAgent'
      ) AS agent_id,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen,
      COUNT(*)::int AS occurrence_count
    FROM audit_events
    WHERE payload_json IS NOT NULL
      AND COALESCE(
            payload_json::json->>'agentId',
            payload_json::json->>'agent_id',
            payload_json::json->>'sourceAgent'
          ) IS NOT NULL
    GROUP BY agent_id
  `).catch(() => ({ rows: [] }));

  // Gather distinct agent IDs from traces table
  const traceAgents = await pool.query(`
    SELECT DISTINCT
      COALESCE(
        metadata::json->>'agentId',
        metadata::json->>'agent_id'
      ) AS agent_id,
      MIN(created_at) AS first_seen,
      MAX(created_at) AS last_seen,
      COUNT(*)::int AS occurrence_count
    FROM traces
    WHERE metadata IS NOT NULL
      AND COALESCE(
            metadata::json->>'agentId',
            metadata::json->>'agent_id'
          ) IS NOT NULL
    GROUP BY agent_id
  `).catch(() => ({ rows: [] }));

  // Combine all observed agent IDs
  const observed = new Map();
  for (const row of [...auditAgents.rows, ...traceAgents.rows]) {
    if (!row.agent_id) continue;
    const existing = observed.get(row.agent_id);
    if (existing) {
      existing.occurrence_count += row.occurrence_count;
      if (row.first_seen < existing.first_seen) existing.first_seen = row.first_seen;
      if (row.last_seen > existing.last_seen) existing.last_seen = row.last_seen;
    } else {
      observed.set(row.agent_id, {
        agent_id: row.agent_id,
        first_seen: row.first_seen,
        last_seen: row.last_seen,
        occurrence_count: row.occurrence_count,
      });
    }
  }

  if (observed.size === 0) return;

  // Fetch registered agent IDs
  const registeredResult = await pool.query(
    `SELECT id FROM agents WHERE id = ANY($1)`,
    [Array.from(observed.keys())]
  ).catch(() => ({ rows: [] }));
  const registeredIds = new Set(registeredResult.rows.map((r) => r.id));

  // Upsert unregistered agents into shadow_agents
  for (const [agentId, data] of observed) {
    if (registeredIds.has(agentId)) continue;

    await pool.query(
      `INSERT INTO shadow_agents (agent_id, first_seen, last_seen, occurrence_count, source)
       VALUES ($1, $2, $3, $4, 'audit')
       ON CONFLICT (agent_id) DO UPDATE SET
         last_seen = GREATEST(shadow_agents.last_seen, EXCLUDED.last_seen),
         occurrence_count = shadow_agents.occurrence_count + EXCLUDED.occurrence_count`,
      [agentId, data.first_seen, data.last_seen, data.occurrence_count]
    ).catch(() => {});
  }
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerShadowAgentRoutes(app) {
  // ── List shadow agents ────────────────────────────────────────────────
  app.get("/api/shadow-agents", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureShadowAgentsTable(pool); _tableEnsured = true; }

    try {
      // Run discovery scan to pick up newly-observed agents
      await discoverShadowAgents(pool);

      const statusFilter = c.req.query("status");
      let query = `SELECT * FROM shadow_agents`;
      const params = [];

      if (statusFilter) {
        query += ` WHERE status = $1`;
        params.push(statusFilter);
      }

      query += ` ORDER BY last_seen DESC`;

      const result = await pool.query(query, params);
      const items = result.rows.map((row) => ({
        agentId: row.agent_id,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        occurrenceCount: row.occurrence_count,
        source: row.source,
        status: row.status,
        acknowledgedBy: row.acknowledged_by,
        acknowledgedAt: row.acknowledged_at,
        blockedBy: row.blocked_by,
        blockedAt: row.blocked_at,
        metadata: JSON.parse(row.metadata_json || "{}"),
      }));

      return c.json({
        ok: true,
        items,
        total: items.length,
        detected: items.filter((i) => i.status === "detected").length,
        acknowledged: items.filter((i) => i.status === "acknowledged").length,
        blocked: items.filter((i) => i.status === "blocked").length,
      });
    } catch (err) {
      mapleLog("error", "shadow_agents.list_failed", { error: err.message });
      return c.json({ error: "Failed to list shadow agents", details: err.message }, 500);
    }
  });

  // ── Acknowledge a shadow agent ────────────────────────────────────────
  app.post("/api/shadow-agents/:agentId/acknowledge", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureShadowAgentsTable(pool); _tableEnsured = true; }

    const agentId = asString(c.req.param("agentId"));
    const authCtx = getAuthContext(c);
    const body = await readJsonBody(c);

    try {
      const result = await pool.query(
        `UPDATE shadow_agents
         SET status = 'acknowledged',
             acknowledged_by = $1,
             acknowledged_at = NOW(),
             metadata_json = $2
         WHERE agent_id = $3
         RETURNING *`,
        [
          authCtx?.userId || "system",
          JSON.stringify(body.metadata || {}),
          agentId,
        ]
      );

      if (result.rows.length === 0) {
        return c.json({ error: "Shadow agent not found." }, 404);
      }

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_SHADOW_AGENT_ACKNOWLEDGED",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_MEDIUM",
        summary: `Shadow agent '${agentId}' acknowledged`,
        payload: { agentId, acknowledgedBy: authCtx?.userId },
      });

      mapleLog("info", "shadow_agents.acknowledged", { agentId });

      return c.json({ ok: true, agentId, status: "acknowledged" });
    } catch (err) {
      mapleLog("error", "shadow_agents.acknowledge_failed", { agentId, error: err.message });
      return c.json({ error: "Failed to acknowledge shadow agent", details: err.message }, 500);
    }
  });

  // ── Block a shadow agent ──────────────────────────────────────────────
  app.post("/api/shadow-agents/:agentId/block", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureShadowAgentsTable(pool); _tableEnsured = true; }

    const agentId = asString(c.req.param("agentId"));
    const authCtx = getAuthContext(c);
    const body = await readJsonBody(c);
    const reason = asString(body.reason) || "Blocked by operator";

    try {
      const result = await pool.query(
        `UPDATE shadow_agents
         SET status = 'blocked',
             blocked_by = $1,
             blocked_at = NOW(),
             metadata_json = $2
         WHERE agent_id = $3
         RETURNING *`,
        [
          authCtx?.userId || "system",
          JSON.stringify({ reason, ...(body.metadata || {}) }),
          agentId,
        ]
      );

      if (result.rows.length === 0) {
        return c.json({ error: "Shadow agent not found." }, 404);
      }

      // Also create a firewall rule to block this agent going forward
      await pool.query(
        `INSERT INTO firewall_rules (match_pattern, action, target, reason, created_by)
         VALUES ($1, 'block', $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [
          `agentId equals ${agentId}`,
          agentId,
          `Shadow agent blocked: ${reason}`,
          authCtx?.userId || "system",
        ]
      ).catch(() => {
        // Firewall rule table may not exist yet — non-fatal
      });

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_SHADOW_AGENT_BLOCKED",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_HIGH",
        summary: `Shadow agent '${agentId}' blocked: ${reason}`,
        payload: { agentId, reason, blockedBy: authCtx?.userId },
      });

      mapleLog("warn", "shadow_agents.blocked", { agentId, reason });

      return c.json({ ok: true, agentId, status: "blocked", reason });
    } catch (err) {
      mapleLog("error", "shadow_agents.block_failed", { agentId, error: err.message });
      return c.json({ error: "Failed to block shadow agent", details: err.message }, 500);
    }
  });
}
