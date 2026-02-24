import { server, database, sharedTraceStore } from "../state.js";
import {
  demoRoutesEnabled,
  incrementEvolvedSuggestionsServed,
} from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import {
  asString,
  asNumber,
  readJsonBody,
} from "../helpers.js";
import {
  resolveTraceByIdOrLatest,
  buildYcMetrics,
} from "../trace-helpers.js";
import { buildYcAppBrief, type YcBriefFocus } from "../strategy/yc-narrative.js";

if (demoRoutesEnabled) {
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
