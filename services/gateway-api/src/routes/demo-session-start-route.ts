import { server, database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import {
  asString,
  asBoolean,
  readJsonBody,
} from "../helpers.js";
import {
  getLatestTraceBySessionForCurrentOwner,
  upsertTraceForCurrentOwner,
  auditAndPersist,
  recommendedRiskStepIndex,
  resolveBridgeTarget,
  bridgeOverrideDeniedBody,
} from "../trace-helpers.js";
import { startObservation } from "../bridge/openclaw-bridge.js";
import { toTraceSummary } from "../core/presenters.js";

export function registerDemoStartRoute(app: typeof server.app) {
  app.post("/api/demo/start", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const sessionId = asString(body.sessionId) ?? `yc-demo-${Date.now()}`;
    const source = "openclaw" as const;
    const bridgeTarget = resolveBridgeTarget(body);
    if (bridgeTarget.overrideRejected) {
      return c.json(bridgeOverrideDeniedBody(), 403);
    }
    const reuseLatest = asBoolean(body.reuseLatest, false);

    let trace = reuseLatest ? getLatestTraceBySessionForCurrentOwner(sessionId) : undefined;
    if (!trace) {
      try {
        trace = await startObservation({
          sessionId,
          source,
          bridgeUrl: bridgeTarget.bridgeUrl,
          token: bridgeTarget.token,
        });
        upsertTraceForCurrentOwner(trace);
      } catch (startError) {
        return c.json(
          {
            error:
              startError instanceof Error
                ? startError.message
                : "Unable to start observation from OpenClaw bridge.",
          },
          502,
        );
      }
    }

    const report = auditAndPersist(trace);
    const recommendedBlockStepIndex = recommendedRiskStepIndex(trace);

    return c.json({
      ok: true,
      action: "start",
      traceId: trace.id,
      sessionId: trace.sessionId,
      source: trace.source,
      bridgeLocked: bridgeTarget.overrideLocked,
      stepCount: trace.steps.length,
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
      recommendedBlockStepIndex,
      trace: toTraceSummary(trace),
    });
  });
}
