import { server, database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import {
  asString,
  asBoolean,
  asNumber,
  readJsonBody,
} from "../helpers.js";
import {
  getTraceForCurrentOwner,
  getLatestTraceBySessionForCurrentOwner,
  resolveTraceByIdOrLatest,
  upsertTraceForCurrentOwner,
  auditAndPersist,
  resolveBridgeTarget,
  bridgeOverrideDeniedBody,
  mergeLiveOpenClawTrace,
} from "../trace-helpers.js";
import { startObservation } from "../bridge/openclaw-bridge.js";

export function registerDemoSyncRoute(app: typeof server.app) {
  app.post("/api/demo/sync", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const traceId = asString(body.traceId);
    const sessionId = asString(body.sessionId);
    const explicitTrace = traceId ? getTraceForCurrentOwner(traceId) : undefined;
    const sessionTrace = !explicitTrace && sessionId ? getLatestTraceBySessionForCurrentOwner(sessionId) : undefined;
    const trace = explicitTrace ?? sessionTrace ?? resolveTraceByIdOrLatest(undefined);
    if (!trace) {
      return c.json({ error: "No traces found. Run demo start first." }, 404);
    }

    if (trace.source !== "openclaw") {
      return c.json({
        ok: true,
        action: "sync",
        traceId: trace.id,
        source: trace.source,
        synced: false,
        reason: "Trace source is not openclaw.",
        stepCount: trace.steps.length,
        status: trace.status,
      });
    }

    const ingestMode =
      trace.metadata && typeof trace.metadata.ingestMode === "string"
        ? String(trace.metadata.ingestMode).toLowerCase()
        : undefined;
    if (ingestMode === "push") {
      return c.json({
        ok: true,
        action: "sync",
        traceId: trace.id,
        sessionId: trace.sessionId,
        source: trace.source,
        synced: false,
        reason: "Trace is push-ingested; bridge sync skipped.",
        stepCount: trace.steps.length,
        status: trace.status,
      });
    }

    const metadataBridgeUrl =
      trace.metadata && typeof trace.metadata.bridgeUrl === "string"
        ? String(trace.metadata.bridgeUrl)
        : undefined;
    const bridgeTarget = resolveBridgeTarget(body, {
      defaultBridgeUrl: metadataBridgeUrl,
    });
    if (bridgeTarget.overrideRejected) {
      return c.json(bridgeOverrideDeniedBody(), 403);
    }

    try {
      const latest = await startObservation({
        sessionId: trace.sessionId,
        source: "openclaw",
        bridgeUrl: bridgeTarget.bridgeUrl,
        token: bridgeTarget.token,
      });
      const previousStepCount = trace.steps.length;
      if (latest.steps.length === 0) {
        const report = auditAndPersist(trace, {
          useCommunityBaseline: asBoolean(body.useCommunityBaseline, true),
          threshold: asNumber(body.threshold),
        });
        return c.json({
          ok: true,
          action: "sync",
          traceId: trace.id,
          sessionId: trace.sessionId,
          source: trace.source,
          synced: true,
          addedSteps: 0,
          stepCount: trace.steps.length,
          overallRiskScore: report.overallRiskScore,
          severity: report.severity,
          status: trace.status,
          bridgeUrl: bridgeTarget.bridgeUrl,
          bridgeLocked: bridgeTarget.overrideLocked,
          note: "Bridge returned no events; preserved existing trace steps.",
        });
      }
      const merged = mergeLiveOpenClawTrace(trace, latest);
      upsertTraceForCurrentOwner(merged);
      const report = auditAndPersist(merged, {
        useCommunityBaseline: asBoolean(body.useCommunityBaseline, true),
        threshold: asNumber(body.threshold),
      });
      const addedSteps = Math.max(0, merged.steps.length - previousStepCount);

      return c.json({
        ok: true,
        action: "sync",
        traceId: merged.id,
        sessionId: merged.sessionId,
        source: merged.source,
        synced: true,
        addedSteps,
        stepCount: merged.steps.length,
        overallRiskScore: report.overallRiskScore,
        severity: report.severity,
        status: merged.status,
        bridgeUrl: bridgeTarget.bridgeUrl,
        bridgeLocked: bridgeTarget.overrideLocked,
      });
    } catch (syncError) {
      return c.json(
        {
          ok: false,
          action: "sync",
          traceId: trace.id,
          error: syncError instanceof Error ? syncError.message : "Unable to sync trace.",
        },
        502,
      );
    }
  });
}
