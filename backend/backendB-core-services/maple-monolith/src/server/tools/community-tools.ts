import { error, object } from "mcp-use/server";
import {
  shareTraceAnonInputSchema,
  suggestEvolvedSkillsInputSchema,
  ycAppBriefInputSchema,
} from "../../core/tool-schemas.js";
import type { Trace } from "../../core/types.js";
import type { YcBriefFocus } from "../../strategy/yc-narrative.js";

interface ToolRegistrar {
  tool: (...args: any[]) => unknown;
}

interface SharedTraceStoreLike {
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
}

interface RegisterCommunityToolsDeps {
  getTraceForCurrentOwner: (traceId: string) => Trace | undefined;
  sharedTraceStore: SharedTraceStoreLike;
  trackEvolvedSuggestions: (count: number) => void;
  buildYcMetrics: () => any;
  buildYcAppBrief: (metrics: any, focus?: YcBriefFocus) => unknown;
}

export function registerCommunityTools(server: ToolRegistrar, deps: RegisterCommunityToolsDeps): void {
  const {
    getTraceForCurrentOwner,
    sharedTraceStore,
    trackEvolvedSuggestions,
    buildYcMetrics,
    buildYcAppBrief,
  } = deps;

  server.tool(
    {
      name: "share_trace_anon",
      description:
        "Share an anonymized trace to the community pool to improve evolved-skill recommendations.",
      schema: shareTraceAnonInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({
      traceId,
      taskLabel,
      objective,
      tags,
    }: {
      traceId: string;
      taskLabel?: string;
      objective?: string;
      tags: string[];
    }) => {
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
      trackEvolvedSuggestions(previewSuggestions.length);

      return object({
        sharedTraceId: sharedTrace.id,
        behaviorSignature: sharedTrace.behaviorSignature,
        sharedAt: sharedTrace.sharedAt,
        objective: sharedTrace.objective,
        taskLabel: sharedTrace.taskLabel,
        communityStats: sharedTraceStore.getStats(),
        previewSuggestions,
      });
    }
  );

  server.tool(
    {
      name: "suggest_evolved_skills",
      description:
        "Generate evolved skill suggestions from anonymized shared traces using embedding similarity.",
      schema: suggestEvolvedSkillsInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({
      query,
      limit,
      minConfidence,
    }: {
      query: string;
      limit: number;
      minConfidence: number;
    }) => {
      const suggestions = sharedTraceStore.suggestEvolvedSkills(query, {
        limit,
        minConfidence,
      });
      trackEvolvedSuggestions(suggestions.length);

      return object({
        query,
        count: suggestions.length,
        suggestions,
        communityStats: sharedTraceStore.getStats(),
      });
    }
  );

  server.tool(
    {
      name: "yc_app_brief",
      description:
        "Generate YC-ready positioning with moat, traction, and freemium revenue narrative using live product metrics.",
      schema: ycAppBriefInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ focus }: { focus: YcBriefFocus }) => {
      const metrics = buildYcMetrics();
      return object({
        generatedAt: new Date().toISOString(),
        metrics,
        brief: buildYcAppBrief(metrics, focus),
      });
    }
  );
}
