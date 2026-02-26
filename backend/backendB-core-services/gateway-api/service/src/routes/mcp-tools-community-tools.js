import { error, object, text } from "mcp-use/server";
// zod v3/v4 compatibility shim — mcp-use internally expects zod v4 types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zodCompat = (schema) => schema;
import { server, sharedTraceStore } from "../state.js";
import { incrementEvolvedSuggestionsServed } from "../config.js";
import { getTraceForCurrentOwner, listTracesForCurrentOwner, buildYcMetrics, renderTraceMarkdown, } from "../trace-helpers.js";
import { toTraceSummary } from "../core/presenters.js";
import { exportTraceInputSchema, listTracesInputSchema, shareTraceAnonInputSchema, suggestEvolvedSkillsInputSchema, ycAppBriefInputSchema, } from "../core/tool-schemas.js";
import { buildYcAppBrief } from "../strategy/yc-narrative.js";
export function registerMcpCommunityTools() {
    // ── share_trace_anon ──────────────────────────────────────────────────────
    server.tool({
        name: "share_trace_anon",
        description: "Share an anonymized trace to the community pool to improve evolved-skill recommendations.",
        schema: zodCompat(shareTraceAnonInputSchema),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async ({ traceId, taskLabel, objective, tags }) => {
        const trace = getTraceForCurrentOwner(traceId);
        if (!trace) {
            return error(`Trace ${traceId} not found.`);
        }
        const sharedTrace = sharedTraceStore.shareTrace(trace, { taskLabel, objective, tags });
        const previewQuery = objective ?? taskLabel ?? "agent automation";
        const previewSuggestions = sharedTraceStore.suggestEvolvedSkills(previewQuery, {
            limit: 2,
            minConfidence: 0.2,
        });
        incrementEvolvedSuggestionsServed(previewSuggestions.length);
        return object({
            sharedTraceId: sharedTrace.id,
            behaviorSignature: sharedTrace.behaviorSignature,
            sharedAt: sharedTrace.sharedAt,
            objective: sharedTrace.objective,
            taskLabel: sharedTrace.taskLabel,
            communityStats: sharedTraceStore.getStats(),
            previewSuggestions,
        });
    });
    // ── suggest_evolved_skills ────────────────────────────────────────────────
    server.tool({
        name: "suggest_evolved_skills",
        description: "Generate evolved skill suggestions from anonymized shared traces using embedding similarity.",
        schema: zodCompat(suggestEvolvedSkillsInputSchema),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ query, limit, minConfidence }) => {
        const suggestions = sharedTraceStore.suggestEvolvedSkills(query, {
            limit,
            minConfidence,
        });
        incrementEvolvedSuggestionsServed(suggestions.length);
        return object({
            query,
            count: suggestions.length,
            suggestions,
            communityStats: sharedTraceStore.getStats(),
        });
    });
    // ── yc_app_brief ─────────────────────────────────────────────────────────
    server.tool({
        name: "yc_app_brief",
        description: "Generate YC-ready positioning with moat, traction, and freemium revenue narrative using live product metrics.",
        schema: zodCompat(ycAppBriefInputSchema),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ focus }) => {
        const metrics = buildYcMetrics();
        return object({
            generatedAt: new Date().toISOString(),
            metrics,
            brief: buildYcAppBrief(metrics, focus),
        });
    });
    // ── list_traces ───────────────────────────────────────────────────────────
    server.tool({
        name: "list_traces",
        description: "List recent traces and risk metadata.",
        schema: zodCompat(listTracesInputSchema),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ limit, sessionId }) => {
        const traces = listTracesForCurrentOwner(limit, sessionId);
        return object({
            count: traces.length,
            traces: traces.map((trace) => toTraceSummary(trace)),
        });
    });
    // ── export_trace ──────────────────────────────────────────────────────────
    server.tool({
        name: "export_trace",
        description: "Export a trace in JSON or Markdown format for sharing and debugging.",
        schema: zodCompat(exportTraceInputSchema),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ traceId, format }) => {
        const trace = getTraceForCurrentOwner(traceId);
        if (!trace) {
            return error(`Trace ${traceId} not found.`);
        }
        if (format === "markdown") {
            return text(renderTraceMarkdown(trace));
        }
        return object({
            trace,
        });
    });
}
//# sourceMappingURL=mcp-tools-community-tools.js.map