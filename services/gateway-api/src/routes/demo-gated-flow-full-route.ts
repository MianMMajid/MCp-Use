import { server, database, sharedTraceStore } from "../state.js";
import { incrementEvolvedSuggestionsServed } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import {
  asString,
  asBoolean,
  asNumber,
  readJsonBody,
} from "../helpers.js";
import {
  upsertTraceForCurrentOwner,
  auditAndPersist,
  recommendedRiskStepIndex,
  setGuardActionForCurrentOwner,
  resolveBridgeTarget,
  bridgeOverrideDeniedBody,
  defaultForkEdits,
  buildYcMetrics,
} from "../trace-helpers.js";
import { startObservation } from "../bridge/openclaw-bridge.js";
import { forkTrace } from "../core/forking.js";
import { buildYcAppBrief } from "../strategy/yc-narrative.js";
import type { Trace } from "@maple/types";

export function registerDemoFullRoute(app: typeof server.app) {
  app.post("/api/demo/full", async (c) => {
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
        502,
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
      "Blocked by Maple guided demo full flow.",
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
        400,
      );
    }
  });
}
