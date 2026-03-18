import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { mapleLog } from "../logging.js";
import { apiErrorResponse } from "../api-error.js";
import {
  listOpenClawRuns,
  getOpenClawRun,
  getOpenClawRunTimeline,
} from "../core/openclaw-agent-runtime.js";

/**
 * M3-04..06: Run routes.
 *
 * GET /api/runs            — list runs with limit/cursor
 * GET /api/runs/:runId     — single run detail
 * GET /api/runs/:runId/timeline — run timeline with events
 */
export function registerRunRoutes(app) {
  // GET /api/runs — list runs
  app.get("/api/runs", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const limitRaw = Number.parseInt(c.req.query("limit") ?? "20", 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 20;
    const cursor = (c.req.query("cursor") ?? "").trim();

    try {
      const result = await listOpenClawRuns({ limit, cursor });
      return c.json({
        ok: true,
        items: result.items,
        nextCursor: result.nextCursor ?? "",
      });
    } catch (err) {
      mapleLog("warn", "run_list_failed", { error: err.message });
      return c.json({ ok: true, items: [], nextCursor: "" });
    }
  });

  // GET /api/runs/:runId — single run detail
  app.get("/api/runs/:runId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const runId = String(c.req.param("runId") ?? "").trim();
    if (!runId) {
      return apiErrorResponse(c, 400, "INVALID_ARGUMENT", "runId is required.");
    }

    try {
      const run = await getOpenClawRun(runId);
      if (!run) {
        return apiErrorResponse(c, 404, "NOT_FOUND", "Run not found.");
      }
      return c.json({ ok: true, run });
    } catch (err) {
      mapleLog("warn", "run_get_failed", { runId, error: err.message });
      return apiErrorResponse(c, 500, "INTERNAL", "Failed to fetch run.", err.message);
    }
  });

  // GET /api/runs/:runId/timeline — run timeline with events
  app.get("/api/runs/:runId/timeline", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const runId = String(c.req.param("runId") ?? "").trim();
    if (!runId) {
      return apiErrorResponse(c, 400, "INVALID_ARGUMENT", "runId is required.");
    }

    try {
      const result = await getOpenClawRunTimeline(runId);
      if (!result) {
        return apiErrorResponse(c, 404, "NOT_FOUND", "Run not found.");
      }
      return c.json({
        ok: true,
        run: result.run,
        timeline: result.timeline,
      });
    } catch (err) {
      mapleLog("warn", "run_timeline_failed", { runId, error: err.message });
      return apiErrorResponse(c, 500, "INTERNAL", "Failed to fetch run timeline.", err.message);
    }
  });
}
