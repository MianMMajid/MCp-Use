import { forkTrace } from "../../core/forking.js";
import type { OpenClawRawEvent, Trace } from "../../core/types.js";
import type { YcBriefFocus } from "../../strategy/yc-narrative.js";
import type { Hono } from "hono";

interface RequireApiKeyContext {
  req: {
    header: (name: string) => string | undefined;
  };
  json: (body: unknown, status?: number) => Response;
}

interface DemoBridgeTarget {
  bridgeUrl: string;
  token: string;
  overrideLocked: boolean;
  overrideRejected?: boolean;
}

interface RegisterDemoRoutesDeps {
  asBoolean: (value: unknown, fallback: boolean) => boolean;
  asNumber: (value: unknown) => number | undefined;
  asString: (value: unknown) => string | undefined;
  auditAndPersist: (
    trace: Trace,
    options?: { useCommunityBaseline?: boolean; threshold?: number }
  ) => { overallRiskScore: number; severity: string; flags: Array<{ type: string }> };
  bridgeOverrideDeniedBody: () => unknown;
  buildYcAppBrief: (metrics: any, focus?: YcBriefFocus) => unknown;
  buildYcMetrics: () => unknown;
  clampStepIndex: (trace: Trace, stepIndex: number) => number;
  createTraceForCurrentOwner: (base: Omit<Trace, "id" | "startedAt" | "updatedAt">) => Trace;
  defaultForkEdits: (value: unknown) => {
    prompt?: string;
    output?: string;
    command?: string;
    toolName?: string;
    toolResponse?: string;
    appendSimulationNote?: string;
  };
  getLatestTraceBySessionForCurrentOwner: (sessionId: string) => Trace | undefined;
  getTraceForCurrentOwner: (traceId: string) => Trace | undefined;
  launchIsolatedForkSession: (options: {
    forkedTrace: Trace;
    parentTrace: Trace;
    body: Record<string, unknown>;
  }) => Promise<{
    sessionId: string;
    traceId: string;
    source: string;
    overallRiskScore: number;
    severity: string;
  }>;
  mergeLiveOpenClawTrace: (existing: Trace, latest: Trace) => Trace;
  readJsonBody: (c: { req: { json: () => Promise<unknown> } }) => Promise<Record<string, unknown>>;
  recommendedRiskStepIndex: (trace: Trace) => number;
  requireApiKeyResponse: (
    c: RequireApiKeyContext,
    options?: { allowSession?: boolean; requireApiKey?: boolean }
  ) => Response | undefined;
  resolveBridgeTarget: (
    body: Record<string, unknown>,
    options?: { defaultBridgeUrl?: string }
  ) => DemoBridgeTarget;
  resolveTraceByIdOrLatest: (traceId?: string) => Trace | undefined;
  setGuardActionForCurrentOwner: (
    traceId: string,
    stepIndex: number,
    action: "allow" | "block" | "pending",
    reason?: string
  ) => Trace | undefined;
  sharedTraceStore: {
    getEmbeddingBaselines: (limit: number) => number[][];
    getStats: () => unknown;
    shareTrace: (
      trace: Trace,
      options?: { taskLabel?: string; objective?: string; tags?: string[] }
    ) => {
      id: string;
      behaviorSignature: string;
      sharedAt: string;
      objective?: string;
      taskLabel: string;
    };
    suggestEvolvedSkills: (
      query: string,
      options?: { limit?: number; minConfidence?: number }
    ) => unknown[];
  };
  startObservation: (options: {
    sessionId: string;
    source?: "openclaw" | "auto";
    bridgeUrl?: string;
    token?: string;
  }) => Promise<Trace>;
  stepFromBridgeEvent: (event: OpenClawRawEvent, index: number) => TraceStepLike;
  toTraceSummary: (trace: Trace) => unknown;
  trackEvolvedSuggestions: (count: number) => void;
  upsertTraceForCurrentOwner: (trace: Trace) => Trace;
}

interface TraceStepLike {
  index: number;
  timestamp: string;
  actor: Trace["steps"][number]["actor"];
  type: Trace["steps"][number]["type"];
  riskScore: number;
  riskFlags: Trace["steps"][number]["riskFlags"];
  guardStatus: Trace["steps"][number]["guardStatus"];
  prompt?: string;
  toolCall?: Trace["steps"][number]["toolCall"];
  output?: string;
  command?: string;
  externalUrl?: string;
  metadata?: Record<string, unknown>;
}

export function registerDemoRoutes(app: Hono, deps: RegisterDemoRoutesDeps): void {
  const {
    asBoolean,
    asNumber,
    asString,
    auditAndPersist,
    bridgeOverrideDeniedBody,
    buildYcAppBrief,
    buildYcMetrics,
    clampStepIndex,
    createTraceForCurrentOwner,
    defaultForkEdits,
    getLatestTraceBySessionForCurrentOwner,
    getTraceForCurrentOwner,
    launchIsolatedForkSession,
    mergeLiveOpenClawTrace,
    readJsonBody,
    recommendedRiskStepIndex,
    requireApiKeyResponse,
    resolveBridgeTarget,
    resolveTraceByIdOrLatest,
    setGuardActionForCurrentOwner,
    sharedTraceStore,
    startObservation,
    stepFromBridgeEvent,
    toTraceSummary,
    trackEvolvedSuggestions,
    upsertTraceForCurrentOwner,
  } = deps;

  app.get("/api/demo/sessions", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) return unauthorized;

    const bridgeUrl = asString(process.env.OPENCLAW_BRIDGE_URL) ?? "";
    const bridgeToken = asString(process.env.OPENCLAW_BRIDGE_TOKEN) ?? "";
    if (!bridgeUrl || !bridgeToken) {
      return c.json({ sessions: [] });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(new URL("/sessions", bridgeUrl), {
          headers: { Authorization: `Bearer ${bridgeToken}` },
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

  app.post("/api/demo/start", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.post("/api/demo/sync", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const traceId = asString(body.traceId);
    const sessionId = asString(body.sessionId);
    const explicitTrace = traceId ? getTraceForCurrentOwner(traceId) : undefined;
    const sessionTrace =
      !explicitTrace && sessionId ? getLatestTraceBySessionForCurrentOwner(sessionId) : undefined;
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
        502
      );
    }
  });

  app.post("/api/demo/audit", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.post("/api/demo/ml", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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
    const anomalies = report.flags
      .filter((flag) => flag.type === "embedding_anomaly")
      .slice(0, topAnomalies);

    return c.json({
      ok: true,
      action: "ml",
      traceId: trace.id,
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
      anomalyCount: anomalies.length,
      anomalies,
      usedCommunityBaseline: useCommunityBaseline,
      baselinePoolSize: useCommunityBaseline
        ? sharedTraceStore.getEmbeddingBaselines(250).length
        : 0,
    });
  });

  app.post("/api/demo/block", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.post("/api/demo/guard", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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
    const reason = asString(body.reason);

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

  app.post("/api/demo/fork", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.post("/api/demo/full", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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
        ? body.tags.filter(
            (tag): tag is string => typeof tag === "string" && tag.trim().length > 0
          )
        : ["security", "guardrails", "openclaw"];

      const sharedTrace = sharedTraceStore.shareTrace(blockedTrace, {
        taskLabel,
        objective,
        tags,
      });
      const suggestions = sharedTraceStore.suggestEvolvedSkills(objective, {
        limit: 3,
        minConfidence: 0.3,
      });
      trackEvolvedSuggestions(suggestions.length);

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
          error:
            forkError instanceof Error
              ? forkError.message
              : "Unable to complete full demo flow.",
        },
        400
      );
    }
  });

  app.post("/api/demo/ingest", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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

  app.post("/api/demo/share", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
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
      ? body.tags.filter(
          (tag): tag is string => typeof tag === "string" && tag.trim().length > 0
        )
      : [];

    const sharedTrace = sharedTraceStore.shareTrace(trace, { taskLabel, objective, tags });
    const previewQuery = objective ?? taskLabel ?? "agent automation";
    const previewSuggestions = sharedTraceStore.suggestEvolvedSkills(previewQuery, {
      limit: 2,
      minConfidence: 0.2,
    });
    trackEvolvedSuggestions(previewSuggestions.length);

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

  app.post("/api/demo/suggest", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const query = asString(body.query) ?? "safe inbox triage automation";
    const limitRaw = asNumber(body.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(10, Math.trunc(limitRaw ?? 3)))
      : 3;
    const minConfidenceRaw = asNumber(body.minConfidence);
    const minConfidence = Number.isFinite(minConfidenceRaw)
      ? Math.max(0, Math.min(1, minConfidenceRaw ?? 0.4))
      : 0.4;

    const suggestions = sharedTraceStore.suggestEvolvedSkills(query, {
      limit,
      minConfidence,
    });
    trackEvolvedSuggestions(suggestions.length);

    return c.json({
      ok: true,
      action: "suggest",
      query,
      count: suggestions.length,
      suggestions,
      communityStats: sharedTraceStore.getStats(),
    });
  });

  app.post("/api/demo/brief", async (c) => {
    const unauthorized = requireApiKeyResponse(c);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await readJsonBody(c);
    const rawFocus = asString(body.focus);
    const focus: YcBriefFocus =
      rawFocus === "moat" || rawFocus === "traction" || rawFocus === "revenue"
        ? rawFocus
        : "full";

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
