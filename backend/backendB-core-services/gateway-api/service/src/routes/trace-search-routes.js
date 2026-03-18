import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { mapleLog } from "../logging.js";
import { apiErrorResponse } from "../api-error.js";

/**
 * M3-01..03: Trace search routes.
 *
 * GET /api/traces/search — search traces with parameterized queries.
 */
export function registerTraceSearchRoutes(app) {
  app.get("/api/traces/search", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const agentId = (c.req.query("agentId") ?? "").trim();
    const status = (c.req.query("status") ?? "").trim();
    const since = (c.req.query("since") ?? "").trim();
    const until = (c.req.query("until") ?? "").trim();
    const severity = (c.req.query("severity") ?? "").trim();
    const limitRaw = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 50;
    const cursor = (c.req.query("cursor") ?? "").trim();

    try {
      if (!database?.pool) {
        // Fallback: return empty result when no database is available
        return c.json({ ok: true, items: [], nextCursor: "" });
      }

      const conditions = [];
      const params = [];
      let paramIndex = 1;

      if (agentId) {
        conditions.push(`agent_id = $${paramIndex}`);
        params.push(agentId);
        paramIndex += 1;
      }
      if (status) {
        conditions.push(`status = $${paramIndex}`);
        params.push(status);
        paramIndex += 1;
      }
      if (since) {
        conditions.push(`created_at >= $${paramIndex}`);
        params.push(since);
        paramIndex += 1;
      }
      if (until) {
        conditions.push(`created_at <= $${paramIndex}`);
        params.push(until);
        paramIndex += 1;
      }
      if (severity) {
        conditions.push(`severity = $${paramIndex}`);
        params.push(severity);
        paramIndex += 1;
      }

      const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      params.push(limit);
      const limitParam = `$${paramIndex}`;
      paramIndex += 1;

      params.push(offset);
      const offsetParam = `$${paramIndex}`;

      const sql = `
        SELECT id, trace_id, agent_id, session_id, status, severity, created_at, updated_at, summary
        FROM traces
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      const result = await database.pool.query(sql, params);
      const items = result.rows.map((row) => ({
        id: row.id ?? row.trace_id,
        traceId: row.trace_id ?? row.id,
        agentId: row.agent_id ?? "",
        sessionId: row.session_id ?? "",
        status: row.status ?? "",
        severity: row.severity ?? "",
        createdAt: row.created_at ?? "",
        updatedAt: row.updated_at ?? "",
        summary: row.summary ?? "",
      }));

      const nextCursor = items.length === limit ? String(offset + items.length) : "";

      return c.json({ ok: true, items, nextCursor });
    } catch (err) {
      mapleLog("warn", "trace_search_failed", { error: err.message });
      return c.json({ ok: true, items: [], nextCursor: "" });
    }
  });
}
