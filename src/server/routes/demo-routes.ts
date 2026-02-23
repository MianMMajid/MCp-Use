import { server, database, sharedTraceStore } from "../state.js";
import {
  demoRoutesEnabled,
  configuredBridgeUrl,
  configuredBridgeToken,
  evolvedSuggestionsServed,
  incrementEvolvedSuggestionsServed,
} from "../config.js";
import {
  requireApiKeyResponse,
  currentOwnerKeyFingerprintsForLookup,
} from "../auth.js";
import {
  asString,
  asBoolean,
  asNumber,
  readJsonBody,
  errorMessage,
} from "../helpers.js";
import { mapleLog } from "../logging.js";
import {
  getTraceForCurrentOwner,
  getLatestTraceBySessionForCurrentOwner,
  listTracesForCurrentOwner,
  createTraceForCurrentOwner,
  upsertTraceForCurrentOwner,
  clearTracesForCurrentOwner,
  resolveTraceByIdOrLatest,
  auditAndPersist,
  recommendedRiskStepIndex,
  clampStepIndex,
  setGuardActionForCurrentOwner,
  resolveBridgeTarget,
  bridgeOverrideDeniedBody,
  defaultForkEdits,
  launchIsolatedForkSession,
  mergeLiveOpenClawTrace,
  buildYcMetrics,
  ingestOpenClawEvents,
  asOpenClawRawEvent,
  buildCandidateStep,
} from "../trace-helpers.js";
import {
  startObservation,
  stepFromBridgeEvent,
} from "../../bridge/openclaw-bridge.js";
import { forkTrace } from "../../core/forking.js";
import { toTraceSummary } from "../../core/presenters.js";
import type { Trace, OpenClawRawEvent } from "../../core/types.js";
import { buildYcAppBrief, type YcBriefFocus } from "../../strategy/yc-narrative.js";

// ── Demo Routes ─────────────────────────────────────────────────────────────

if (demoRoutesEnabled) {
  server.app.get("/api/demo/sessions", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;
    if (!configuredBridgeUrl || !configuredBridgeToken) {
      return c.json({ sessions: [] });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(new URL("/sessions", configuredBridgeUrl), {
          headers: { Authorization: `Bearer ${configuredBridgeToken}` },
          signal: controller.signal,
        });
        if (!res.ok) return c.json({ sessions: [] });
        const body = (await res.json()) as { sessions?: unknown };
        const sessions = Array.isArray(body.sessions) ? body.sessions : [];
        return c.json({ sessions });
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return c.json({ sessions: [] });
    }
  });

  server.app.post("/api/demo/start", async (c) => {
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
          502
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

  server.app.post("/api/demo/sync", async (c) => {
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
      // Preserve push-ingested/manual steps when bridge sync returns no events.
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
        502
      );
    }
  });

  server.app.post("/api/demo/audit", async (c) => {
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

  server.app.post("/api/demo/ml", async (c) => {
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

    const useCommunityBaseline = asBoolean(body.useCommunityBaseline, true);
    const threshold = asNumber(body.threshold);
    const topAnomaliesRaw = asNumber(body.topAnomalies);
    const topAnomalies = Number.isFinite(topAnomaliesRaw)
      ? Math.max(1, Math.min(20, Math.trunc(topAnomaliesRaw ?? 5)))
      : 5;

    const report = auditAndPersist(trace, {
      useCommunityBaseline,
      threshold,
    });
    const anomalies = report.flags.filter((flag) => flag.type === "embedding_anomaly").slice(0, topAnomalies);

    return c.json({
      ok: true,
      action: "ml",
      traceId: trace.id,
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
      anomalyCount: anomalies.length,
      anomalies,
      usedCommunityBaseline: useCommunityBaseline,
      baselinePoolSize: useCommunityBaseline ? sharedTraceStore.getEmbeddingBaselines(250).length : 0,
    });
  });

  server.app.post("/api/demo/block", async (c) => {
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
    if (trace.steps.length === 0) {
      return c.json({ error: "Trace has no steps to block." }, 400);
    }

    const requestedIndex = asNumber(body.stepIndex);
    const stepIndex = Number.isFinite(requestedIndex)
      ? clampStepIndex(trace, requestedIndex ?? 0)
      : recommendedRiskStepIndex(trace);
    const reason =
      asString(body.reason) ?? "Blocked by Maple guided demo due to high-risk behavior.";

    const updated = setGuardActionForCurrentOwner(trace.id, stepIndex, "block", reason);
    if (!updated) {
      return c.json({ error: "Unable to apply block action." }, 400);
    }

    const report = auditAndPersist(updated);

    return c.json({
      ok: true,
      action: "block",
      traceId: updated.id,
      stepIndex,
      status: updated.status,
      quarantined: updated.status === "quarantined",
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
    });
  });

  server.app.post("/api/demo/guard", async (c) => {
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
    if (trace.steps.length === 0) {
      return c.json({ error: "Trace has no steps to guard." }, 400);
    }

    const requestedIndex = asNumber(body.stepIndex);
    const stepIndex = Number.isFinite(requestedIndex)
      ? clampStepIndex(trace, requestedIndex ?? 0)
      : recommendedRiskStepIndex(trace);
    const action = body.action;
    if (action !== "allow" && action !== "block" && action !== "pending") {
      return c.json({ error: "action must be one of: allow, block, pending." }, 400);
    }

    const defaultReason =
      action === "block"
        ? "Blocked by Maple node action modal."
        : action === "allow"
          ? "Allowed by Maple node action modal."
          : "Set to pending by Maple node action modal.";
    const reason = asString(body.reason) ?? defaultReason;

    const updated = setGuardActionForCurrentOwner(trace.id, stepIndex, action, reason);
    if (!updated) {
      return c.json({ error: "Unable to apply guard action." }, 400);
    }

    const report = auditAndPersist(updated);

    return c.json({
      ok: true,
      action: "guard",
      traceId: updated.id,
      stepIndex,
      guardAction: action,
      status: updated.status,
      quarantined: updated.status === "quarantined",
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
    });
  });

  server.app.post("/api/demo/fork", async (c) => {
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
    if (trace.steps.length === 0) {
      return c.json({ error: "Trace has no steps to fork." }, 400);
    }

    const requestedForkStep = asNumber(body.forkStepIndex);
    const fallbackForkStep = recommendedRiskStepIndex(trace);
    const forkStepIndex = Number.isFinite(requestedForkStep)
      ? clampStepIndex(trace, requestedForkStep ?? 0)
      : fallbackForkStep;
    const launchIsolatedSession = asBoolean(body.launchIsolatedSession, false);
    if (launchIsolatedSession) {
      const bridgeTarget = resolveBridgeTarget(body);
      if (bridgeTarget.overrideRejected) {
        return c.json(bridgeOverrideDeniedBody(), 403);
      }
    }

    try {
      const edits = defaultForkEdits(body.edits);
      const { forkedTrace, diff } = forkTrace(trace, forkStepIndex, edits);
      upsertTraceForCurrentOwner(forkedTrace);
      const report = auditAndPersist(forkedTrace);

      let runtime:
        | {
            launched: true;
            sessionId: string;
            traceId: string;
            source: string;
            overallRiskScore: number;
            severity: string;
          }
        | {
            launched: false;
            error: string;
          }
        | undefined;

      if (launchIsolatedSession) {
        try {
          const runtimeResult = await launchIsolatedForkSession({
            forkedTrace,
            parentTrace: trace,
            body,
          });
          runtime = {
            launched: true,
            ...runtimeResult,
          };
        } catch (runtimeError) {
          runtime = {
            launched: false,
            error:
              runtimeError instanceof Error
                ? runtimeError.message
                : "Unable to launch isolated OpenClaw fork session.",
          };
        }
      }

      return c.json({
        ok: true,
        action: "fork",
        traceId: trace.id,
        forkedTraceId: forkedTrace.id,
        forkStepIndex,
        changedSteps: diff.changedSteps,
        addedSteps: diff.addedSteps,
        overallRiskScore: report.overallRiskScore,
        severity: report.severity,
        runtime,
      });
    } catch (forkError) {
      return c.json(
        {
          error: forkError instanceof Error ? forkError.message : "Unable to fork trace.",
        },
        400
      );
    }
  });

  server.app.post("/api/demo/full", async (c) => {
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

    let trace: Trace;
    try {
      trace = await startObservation({
        sessionId,
        source,
        bridgeUrl: bridgeTarget.bridgeUrl,
        token: bridgeTarget.token,
      });
    } catch (startError) {
      return c.json(
        {
          error:
            startError instanceof Error
              ? startError.message
              : "Unable to start observation from OpenClaw bridge.",
        },
        502
      );
    }
    upsertTraceForCurrentOwner(trace);

    const startAudit = auditAndPersist(trace, {
      useCommunityBaseline: asBoolean(body.useCommunityBaseline, true),
      threshold: asNumber(body.threshold),
    });

    if (trace.steps.length === 0) {
      return c.json({ error: "Trace has no steps. Demo flow cannot continue." }, 400);
    }

    const blockStepIndex = recommendedRiskStepIndex(trace);
    const blockedTrace = setGuardActionForCurrentOwner(
      trace.id,
      blockStepIndex,
      "block",
      "Blocked by Maple guided demo full flow."
    );
    if (!blockedTrace) {
      return c.json({ error: "Unable to apply block action in full demo flow." }, 400);
    }
    const blockedAudit = auditAndPersist(blockedTrace);

    try {
      const edits = defaultForkEdits(body.edits);
      const { forkedTrace, diff } = forkTrace(blockedTrace, blockStepIndex, edits);
      upsertTraceForCurrentOwner(forkedTrace);
      const forkAudit = auditAndPersist(forkedTrace);

      const taskLabel = asString(body.taskLabel) ?? "safe inbox triage";
      const objective =
        asString(body.objective) ?? "prevent risky autonomous actions before execution";
      const tags = Array.isArray(body.tags)
        ? body.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
        : ["security", "guardrails", "openclaw"];

      const sharedTrace = sharedTraceStore.shareTrace(blockedTrace, { taskLabel, objective, tags });
      const suggestions = sharedTraceStore.suggestEvolvedSkills(objective, {
        limit: 3,
        minConfidence: 0.3,
      });
      incrementEvolvedSuggestionsServed(suggestions.length);

      const metrics = buildYcMetrics();

      return c.json({
        ok: true,
        action: "full",
        sessionId,
        source: trace.source,
        bridgeLocked: bridgeTarget.overrideLocked,
        traceId: blockedTrace.id,
        forkedTraceId: forkedTrace.id,
        blockStepIndex,
        changedSteps: diff.changedSteps,
        startRiskScore: startAudit.overallRiskScore,
        blockedRiskScore: blockedAudit.overallRiskScore,
        forkRiskScore: forkAudit.overallRiskScore,
        sharedTraceId: sharedTrace.id,
        suggestionCount: suggestions.length,
        ycBrief: buildYcAppBrief(metrics, "full"),
      });
    } catch (forkError) {
      return c.json(
        {
          error: forkError instanceof Error ? forkError.message : "Unable to complete full demo flow.",
        },
        400
      );
    }
  });

  server.app.post("/api/demo/ingest", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const traceId = asString(body.traceId);
    const sessionId = asString(body.sessionId);
    const event = body.event && typeof body.event === "object" ? body.event : undefined;

    if (!event) {
      return c.json({ error: "Missing required field: event" }, 400);
    }
    if (!traceId && !sessionId) {
      return c.json({ error: "Either traceId or sessionId must be provided." }, 400);
    }

    let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;

    if (!trace && sessionId) {
      trace = getLatestTraceBySessionForCurrentOwner(sessionId);
    }

    if (!trace) {
      trace = createTraceForCurrentOwner({
        sessionId: sessionId ?? `manual-${Date.now()}`,
        source: "manual",
        status: "active",
        metadata: { mode: "event-ingest" },
        steps: [],
      });
    }

    const nextIndex = trace.steps.length;
    const step = stepFromBridgeEvent(event as OpenClawRawEvent, nextIndex);
    trace.steps.push(step);
    upsertTraceForCurrentOwner(trace);

    const report = auditAndPersist(trace);

    return c.json({
      ok: true,
      traceId: trace.id,
      sessionId: trace.sessionId,
      appendedStep: step.index,
      overallRiskScore: report.overallRiskScore,
      status: trace.status,
    });
  });

  server.app.post("/api/demo/share", async (c) => {
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

    const taskLabel = asString(body.taskLabel) ?? "safe agent workflow";
    const objective =
      asString(body.objective) ?? "prevent risky autonomous actions before execution";
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
      : [];

    const sharedTrace = sharedTraceStore.shareTrace(trace, { taskLabel, objective, tags });
    const previewQuery = objective ?? taskLabel ?? "agent automation";
    const previewSuggestions = sharedTraceStore.suggestEvolvedSkills(previewQuery, {
      limit: 2,
      minConfidence: 0.2,
    });
    incrementEvolvedSuggestionsServed(previewSuggestions.length);

    return c.json({
      ok: true,
      action: "share",
      traceId: trace.id,
      sharedTraceId: sharedTrace.id,
      behaviorSignature: sharedTrace.behaviorSignature,
      sharedAt: sharedTrace.sharedAt,
      objective: sharedTrace.objective,
      taskLabel: sharedTrace.taskLabel,
      communityStats: sharedTraceStore.getStats(),
      previewSuggestions,
    });
  });

  server.app.post("/api/demo/suggest", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const query = asString(body.query) ?? "safe inbox triage automation";
    const limitRaw = asNumber(body.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10, Math.trunc(limitRaw ?? 3))) : 3;
    const minConfidenceRaw = asNumber(body.minConfidence);
    const minConfidence = Number.isFinite(minConfidenceRaw)
      ? Math.max(0, Math.min(1, minConfidenceRaw ?? 0.4))
      : 0.4;

    const suggestions = sharedTraceStore.suggestEvolvedSkills(query, {
      limit,
      minConfidence,
    });
    incrementEvolvedSuggestionsServed(suggestions.length);

    return c.json({
      ok: true,
      action: "suggest",
      query,
      count: suggestions.length,
      suggestions,
      communityStats: sharedTraceStore.getStats(),
    });
  });

  server.app.post("/api/demo/brief", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const rawFocus = asString(body.focus);
    const focus: YcBriefFocus =
      rawFocus === "moat" || rawFocus === "traction" || rawFocus === "revenue" ? rawFocus : "full";

    const metrics = buildYcMetrics();
    return c.json({
      ok: true,
      action: "brief",
      generatedAt: new Date().toISOString(),
      metrics,
      brief: buildYcAppBrief(metrics, focus),
    });
  });
}

// ── Traces Clear (outside demo gate) ────────────────────────────────────────

server.app.post("/api/traces/clear", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }

  const removed = clearTracesForCurrentOwner();
  mapleLog("warn", "api.traces.clear", {
    removed,
    ownerScopes: currentOwnerKeyFingerprintsForLookup() ?? ["*"],
  });
  return c.json({ ok: true, removed });
});

// ── OpenClaw Events Ingest ──────────────────────────────────────────────────

server.app.post("/api/openclaw/events", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database, { allowSession: false, requireApiKey: true });
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonBody(c);
  const traceId = asString(body.traceId);
  const sessionId = asString(body.sessionId);
  const sourceHintRaw = asString(body.source);
  const sourceHint: Trace["source"] =
    sourceHintRaw === "manual" || sourceHintRaw === "openclaw"
      ? sourceHintRaw
      : "openclaw";
  const incoming = Array.isArray(body.events)
    ? body.events
    : body.event && typeof body.event === "object"
      ? [body.event]
      : [];
  mapleLog("info", "api.openclaw.events.begin", {
    traceId: traceId ?? null,
    sessionId: sessionId ?? null,
    sourceHint,
    eventCount: incoming.length,
  });

  if (incoming.length === 0) {
    mapleLog("warn", "api.openclaw.events.reject", {
      reason: "no_events",
      traceId: traceId ?? null,
      sessionId: sessionId ?? null,
    });
    return c.json(
      {
        error: "No events provided.",
        hint: "Provide { sessionId, events: [...] } or { traceId, event: {...} }.",
      },
      400
    );
  }

  if (!traceId && !sessionId) {
    mapleLog("warn", "api.openclaw.events.reject", {
      reason: "missing_trace_or_session",
      eventCount: incoming.length,
    });
    return c.json({ error: "traceId or sessionId is required." }, 400);
  }

  const events = incoming.map(asOpenClawRawEvent).filter((event): event is OpenClawRawEvent => Boolean(event));
  if (events.length === 0) {
    mapleLog("warn", "api.openclaw.events.reject", {
      reason: "no_valid_events",
      traceId: traceId ?? null,
      sessionId: sessionId ?? null,
      eventCount: incoming.length,
    });
    return c.json({ error: "No valid event objects provided." }, 400);
  }

  try {
    const result = ingestOpenClawEvents({
      traceId,
      sessionId,
      events,
      sourceHint,
      metadata: {
        ingress: "api_openclaw_events",
      },
    });
    mapleLog("info", "api.openclaw.events.success", {
      traceId: result.trace.id,
      sessionId: result.trace.sessionId,
      source: result.trace.source,
      appendedCount: result.appendedCount,
      skippedDuplicateCount: result.skippedDuplicateCount,
      stepCount: result.trace.steps.length,
      status: result.trace.status,
    });
    return c.json({
      ok: true,
      action: "openclaw_events_ingest",
      traceId: result.trace.id,
      sessionId: result.trace.sessionId,
      source: result.trace.source,
      ingestMode: "push",
      appendedCount: result.appendedCount,
      skippedDuplicateCount: result.skippedDuplicateCount,
      stepCount: result.trace.steps.length,
      overallRiskScore: result.report.overallRiskScore,
      severity: result.report.severity,
      status: result.trace.status,
    });
  } catch (ingestError) {
    mapleLog("error", "api.openclaw.events.error", {
      traceId: traceId ?? null,
      sessionId: sessionId ?? null,
      detail: errorMessage(ingestError),
    });
    return c.json(
      {
        error: ingestError instanceof Error ? ingestError.message : "Unable to ingest OpenClaw events.",
      },
      400
    );
  }
});
