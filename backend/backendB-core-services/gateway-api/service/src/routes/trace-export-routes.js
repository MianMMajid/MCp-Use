import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { mapleLog } from "../logging.js";
import { apiErrorResponse } from "../api-error.js";

const MAX_EXPORT_LIMIT = 10_000;

/**
 * M3-04..06: Trace export routes.
 *
 * POST /api/traces/export — export traces with filters; supports json and jsonl formats.
 */
export function registerTraceExportRoutes(app) {
  app.post("/api/traces/export", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const body = await c.req.json().catch(() => ({}));
    const agentId = String(body?.agentId ?? "").trim();
    const status = String(body?.status ?? "").trim();
    const since = String(body?.since ?? "").trim();
    const until = String(body?.until ?? "").trim();
    const severity = String(body?.severity ?? "").trim();
    const format = String(body?.format ?? "json").trim().toLowerCase();
    const limitRaw = Number.parseInt(String(body?.limit ?? "1000"), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, MAX_EXPORT_LIMIT))
      : 1000;

    if (format !== "json" && format !== "jsonl") {
      return apiErrorResponse(c, 400, "INVALID_FORMAT", "format must be json or jsonl.");
    }

    try {
      if (!database?.pool) {
        if (format === "jsonl") {
          return c.text("", 200, { "content-type": "application/x-ndjson" });
        }
        return c.json({ ok: true, format: "json", count: 0, items: [] });
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

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      params.push(limit);
      const limitParam = `$${paramIndex}`;

      const sql = `
        SELECT id, trace_id, agent_id, session_id, status, severity,
               created_at, updated_at, summary, payload_json
        FROM traces
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limitParam}
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

      if (format === "jsonl") {
        const content = items.map((item) => JSON.stringify(item)).join("\n");
        return c.text(content, 200, { "content-type": "application/x-ndjson" });
      }

      return c.json({ ok: true, format: "json", count: items.length, items });
    } catch (err) {
      mapleLog("warn", "trace_export_failed", { error: err.message });
      if (format === "jsonl") {
        return c.text("", 200, { "content-type": "application/x-ndjson" });
      }
      return c.json({ ok: true, format: "json", count: 0, items: [] });
    }
  });
}
