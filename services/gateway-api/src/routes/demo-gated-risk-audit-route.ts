import { server, database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import {
  asString,
  asBoolean,
  asNumber,
  readJsonBody,
} from "../helpers.js";
import {
  resolveTraceByIdOrLatest,
  auditAndPersist,
  recommendedRiskStepIndex,
} from "../trace-helpers.js";

export function registerDemoAuditRoute(app: typeof server.app) {
  app.post("/api/demo/audit", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const traceId = asString(body.traceId);
    const trace = resolveTraceByIdOrLatest(traceId);
    if (!trace) {
      return c.json({ error: "No traces found. Run demo start first." }, 404);
    }

    const report = auditAndPersist(trace, {
      useCommunityBaseline: asBoolean(body.useCommunityBaseline, true),
      threshold: asNumber(body.threshold),
    });

    return c.json({
      ok: true,
      action: "audit",
      traceId: trace.id,
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
      flagCount: report.flags.length,
      recommendedBlockStepIndex: recommendedRiskStepIndex(trace),
    });
  });
}
