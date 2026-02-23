import { z } from "zod";
import { error, object, text, widget } from "mcp-use/server";

// zod v3/v4 compatibility shim — mcp-use internally expects zod v4 types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zodCompat = <T>(schema: T): any => schema;
import { server, database, sharedTraceStore, traceStore } from "../state.js";
import {
  configuredBridgeUrl,
  configuredBridgeToken,
  downstreamAppRegistry,
  evolvedSuggestionsServed,
  incrementEvolvedSuggestionsServed,
  bridgeOverrideLockEnabled,
  mcpRouteLockEnabled,
} from "../config.js";
import {
  requireApiKeyResponse,
  currentOwnerKeyFingerprint,
} from "../auth.js";
import {
  asString,
  asObject,
  asBoolean,
  asNumber,
  errorMessage,
  parseAppIdList,
} from "../helpers.js";
import { mapleLog } from "../logging.js";
import {
  getTraceForCurrentOwner,
  getLatestTraceBySessionForCurrentOwner,
  listTracesForCurrentOwner,
  createTraceForCurrentOwner,
  upsertTraceForCurrentOwner,
  resolveTraceByIdOrLatest,
  auditAndPersist,
  recommendedRiskStepIndex,
  clampStepIndex,
  setGuardActionForCurrentOwner,
  resolveBridgeTarget,
  bridgeOverrideDeniedBody,
  defaultForkEdits,
  mergeLiveOpenClawTrace,
  buildYcMetrics,
  renderTraceMarkdown,
  toPolicySnapshot,
} from "../trace-helpers.js";
import {
  handleMcpFirewallProxy,
  resolveDownstreamApp,
  listToolsFromDownstreamCached,
  resolveDispatchAppIds,
  dispatchDownstreamChainAndLog,
} from "../firewall-proxy.js";
import {
  listDownstreamApps as listDownstreamAppsProxy,
} from "../control/downstream-proxy.js";
import {
  startObservation,
  stepFromBridgeEvent,
} from "../bridge/openclaw-bridge.js";
import { forkTrace } from "../core/forking.js";
import {
  toReplayWidgetProps,
  toRiskWidgetProps,
  toTimelineWidgetProps,
  toTraceSummary,
} from "../core/presenters.js";
import {
  auditRiskInputSchema,
  dispatchDownstreamToolInputSchema,
  exportTraceInputSchema,
  guardActionInputSchema,
  guardActionOutputSchema,
  listDownstreamAppsInputSchema,
  listDownstreamToolsInputSchema,
  listTracesInputSchema,
  mlAnomalyReportInputSchema,
  observeSessionInputSchema,
  replayForkInputSchema,
  shareTraceAnonInputSchema,
  suggestEvolvedSkillsInputSchema,
  ycAppBriefInputSchema,
} from "../core/tool-schemas.js";
import type { OpenClawRawEvent, Trace } from "@maple/types";
import { buildYcAppBrief, type YcBriefFocus } from "../strategy/yc-narrative.js";
import {
  listDownstreamApps,
  type DownstreamAppConfig,
} from "../control/downstream-proxy.js";
import type { FirewallStepDecision } from "@maple/security";

// ── observe_session ─────────────────────────────────────────────────────────

server.tool(
  {
    name: "observe_session",
    description:
      "Start observing an agent session, store its execution trace, and render a live timeline widget.",
    schema: zodCompat(observeSessionInputSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    widget: {
      name: "trace-timeline",
      invoking: "Connecting to session...",
      invoked: "Trace timeline ready",
    },
  },
  async ({ sessionId, source, bridgeUrl, token, reuseLatest }) => {
    const bridgeTarget = resolveBridgeTarget({
      bridgeUrl,
      token,
    });
    if (bridgeTarget.overrideRejected) {
      return error(bridgeOverrideDeniedBody().reason);
    }

    let trace: Trace;

    if (reuseLatest) {
      const cached = getLatestTraceBySessionForCurrentOwner(sessionId);
      if (cached) {
        trace = cached;
      } else {
        try {
          trace = await startObservation({
            sessionId,
            source,
            bridgeUrl: bridgeTarget.bridgeUrl,
            token: bridgeTarget.token,
          });
        } catch (observeError) {
          return error(
            observeError instanceof Error
              ? observeError.message
              : "Unable to start observation from OpenClaw bridge."
          );
        }
        upsertTraceForCurrentOwner(trace);
      }
    } else {
      try {
        trace = await startObservation({
          sessionId,
          source,
          bridgeUrl: bridgeTarget.bridgeUrl,
          token: bridgeTarget.token,
        });
      } catch (observeError) {
        return error(
          observeError instanceof Error
            ? observeError.message
            : "Unable to start observation from OpenClaw bridge."
        );
      }
      upsertTraceForCurrentOwner(trace);
    }

    const report = auditAndPersist(trace);
    const timelineProps = toTimelineWidgetProps(trace);

    return widget({
      props: timelineProps,
      output: object({
        traceId: trace.id,
        sessionId: trace.sessionId,
        source: trace.source,
        stepCount: trace.steps.length,
        overallRiskScore: report.overallRiskScore,
        severity: report.severity,
        status: trace.status,
      }),
    });
  }
);

// ── replay_fork ─────────────────────────────────────────────────────────────

server.tool(
  {
    name: "replay_fork",
    description:
      "Fork a trace at a selected step, apply edits, and replay forward in dry-run mode for safe debugging.",
    schema: zodCompat(replayForkInputSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    widget: {
      name: "replay-simulator",
      invoking: "Forking trace...",
      invoked: "Replay diff ready",
    },
  },
  async ({ traceId, forkStepIndex, edits }) => {
    const original = getTraceForCurrentOwner(traceId);
    if (!original) {
      return error(`Trace ${traceId} not found.`);
    }

    try {
      const { forkedTrace, diff } = forkTrace(original, forkStepIndex, edits);
      upsertTraceForCurrentOwner(forkedTrace);
      auditAndPersist(forkedTrace);

      const replayProps = toReplayWidgetProps(original, forkedTrace, diff, forkStepIndex, edits);

      return widget({
        props: replayProps,
        output: object({
          originalTraceId: original.id,
          forkedTraceId: forkedTrace.id,
          forkStepIndex,
          changedSteps: diff.changedSteps,
          addedSteps: diff.addedSteps,
          status: forkedTrace.status,
        }),
      });
    } catch (forkError) {
      return error(
        forkError instanceof Error ? forkError.message : "Unable to fork trace due to unknown error."
      );
    }
  }
);

// ── audit_risk ──────────────────────────────────────────────────────────────

server.tool(
  {
    name: "audit_risk",
    description:
      "Audit a trace for anomalies and risky behavior (shell/network/credentials) and return a risk dashboard.",
    schema: zodCompat(auditRiskInputSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    widget: {
      name: "risk-dashboard",
      invoking: "Running risk analysis...",
      invoked: "Risk dashboard ready",
    },
  },
  async ({ traceId, topFlags }) => {
    const trace = getTraceForCurrentOwner(traceId);
    if (!trace) {
      return error(`Trace ${traceId} not found.`);
    }

    const report = auditAndPersist(trace);

    return widget({
      props: toRiskWidgetProps(trace, report, topFlags),
      output: object({
        traceId,
        overallRiskScore: report.overallRiskScore,
        severity: report.severity,
        flagCount: report.flags.length,
        status: trace.status,
      }),
    });
  }
);

// ── ml_anomaly_report ───────────────────────────────────────────────────────

server.tool(
  {
    name: "ml_anomaly_report",
    description:
      "Run embedding-based anomaly detection on a trace, with optional community baseline from shared anonymized traces.",
    schema: zodCompat(mlAnomalyReportInputSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ traceId, useCommunityBaseline, threshold, topAnomalies }) => {
    const trace = getTraceForCurrentOwner(traceId);
    if (!trace) {
      return error(`Trace ${traceId} not found.`);
    }

    const report = auditAndPersist(trace, { useCommunityBaseline, threshold });
    const anomalies = report.flags.filter((flag) => flag.type === "embedding_anomaly").slice(0, topAnomalies);

    return object({
      traceId,
      overallRiskScore: report.overallRiskScore,
      severity: report.severity,
      anomalyCount: anomalies.length,
      anomalies,
      usedCommunityBaseline: useCommunityBaseline,
      baselinePoolSize: useCommunityBaseline ? sharedTraceStore.getEmbeddingBaselines(250).length : 0,
    });
  }
);

// ── guard_action ────────────────────────────────────────────────────────────

server.tool(
  {
    name: "guard_action",
    description:
      "Approve, block, or set pending state for a specific risky step. Blocking quarantines the trace.",
    schema: zodCompat(guardActionInputSchema),
    outputSchema: zodCompat(guardActionOutputSchema),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async ({ traceId, stepIndex, action, reason }) => {
    const updated = setGuardActionForCurrentOwner(traceId, stepIndex, action, reason);
    if (!updated) {
      return error(
        `Unable to update guard action. Check traceId (${traceId}) and stepIndex (${stepIndex}).`
      );
    }

    auditAndPersist(updated);

    return object({
      traceId,
      stepIndex,
      action,
      status: updated.status,
      quarantined: updated.status === "quarantined",
    });
  }
);

// ── ingest_session_event ────────────────────────────────────────────────────

server.tool(
  {
    name: "ingest_session_event",
    description:
      "Ingest one raw event from an external bridge or webhook into an active trace for near-real-time updates.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    schema: zodCompat(z.object({
      traceId: z.string().optional(),
      sessionId: z.string().optional(),
      event: z.object({}).passthrough(),
    })),
  },
  async ({ traceId, sessionId, event }) => {
    if (!traceId && !sessionId) {
      return error("Either traceId or sessionId must be provided.");
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
        metadata: {
          mode: "event-ingest",
        },
        steps: [],
      });
    }

    const nextIndex = trace.steps.length;
    const step = stepFromBridgeEvent(event as OpenClawRawEvent, nextIndex);
    trace.steps.push(step);
    upsertTraceForCurrentOwner(trace);

    const report = auditAndPersist(trace);

    return object({
      traceId: trace.id,
      sessionId: trace.sessionId,
      appendedStep: step.index,
      overallRiskScore: report.overallRiskScore,
      status: trace.status,
    });
  }
);

// ── share_trace_anon ────────────────────────────────────────────────────────

server.tool(
  {
    name: "share_trace_anon",
    description:
      "Share an anonymized trace to the community pool to improve evolved-skill recommendations.",
    schema: zodCompat(shareTraceAnonInputSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ traceId, taskLabel, objective, tags }) => {
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
  }
);

// ── suggest_evolved_skills ──────────────────────────────────────────────────

server.tool(
  {
    name: "suggest_evolved_skills",
    description:
      "Generate evolved skill suggestions from anonymized shared traces using embedding similarity.",
    schema: zodCompat(suggestEvolvedSkillsInputSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ query, limit, minConfidence }) => {
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
  }
);

// ── yc_app_brief ────────────────────────────────────────────────────────────

server.tool(
  {
    name: "yc_app_brief",
    description:
      "Generate YC-ready positioning with moat, traction, and freemium revenue narrative using live product metrics.",
    schema: zodCompat(ycAppBriefInputSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ focus }) => {
    const metrics = buildYcMetrics();
    return object({
      generatedAt: new Date().toISOString(),
      metrics,
      brief: buildYcAppBrief(metrics, focus),
    });
  }
);

// ── list_downstream_apps ────────────────────────────────────────────────────

server.tool(
  {
    name: "list_downstream_apps",
    description:
      "List downstream MCP apps registered behind Maple. Clients should call Maple only and dispatch via this control plane.",
    schema: zodCompat(listDownstreamAppsInputSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ includeDisabled }) => {
    const apps = listDownstreamApps(downstreamAppRegistry, includeDisabled);
    return object({
      count: apps.length,
      apps,
    });
  }
);

// ── list_downstream_tools ───────────────────────────────────────────────────

server.tool(
  {
    name: "list_downstream_tools",
    description:
      "List tools exposed by a registered downstream MCP app through Maple proxy routing.",
    schema: zodCompat(listDownstreamToolsInputSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ appId }) => {
    let app: DownstreamAppConfig;
    try {
      app = resolveDownstreamApp(appId);
    } catch (configError) {
      return error(errorMessage(configError));
    }

    try {
      const listed = await listToolsFromDownstreamCached(app);
      return object({
        appId: app.id,
        requestId: listed.requestId,
        durationMs: listed.durationMs,
        toolCount: listed.tools.length,
        tools: listed.tools,
      });
    } catch (listError) {
      return error(`Downstream tools/list failed: ${errorMessage(listError)}`);
    }
  }
);

// ── Widget-enabled downstream tool overrides ────────────────────────────────
// These server.tool() definitions take priority over the generic proxy
// for tools/call, providing rich widget UIs in ChatGPT while still
// dispatching to the downstream toolhub.

server.tool(
  {
    name: "web_search",
    description:
      "Search the web for information. Returns ranked results with titles, URLs, and snippets.",
    schema: zodCompat(z.object({
      query: z.string().describe("The search query"),
      maxResults: z.number().optional().describe("Maximum number of results to return"),
    })),
    widget: {
      name: "search-results",
      invoking: "Searching the web...",
      invoked: "Search complete",
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ query, maxResults }) => {
    const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    const chainResult = await dispatchDownstreamChainAndLog({
      appIds,
      toolName: "web_search",
      toolArgs: { query, ...(maxResults != null ? { maxResults } : {}) },
      sessionId: "chatgpt",
      origin: "mcp",
    });
    if (!chainResult.ok) {
      return error(chainResult.failure ?? "Web search failed.");
    }
    const raw = chainResult.finalResult.dispatch?.result as Record<string, unknown> | undefined;
    const results = Array.isArray(raw?.results) ? raw.results : [];
    return widget({
      props: { query, results, totalResults: typeof raw?.totalResults === "number" ? raw.totalResults : results.length, source: "Web" },
      output: text(chainResult.finalResult.dispatch?.textPreview ?? "No results"),
    });
  }
);

server.tool(
  {
    name: "hn_search",
    description:
      "Search Hacker News for stories, comments, and discussions.",
    schema: zodCompat(z.object({
      query: z.string().describe("The search query"),
      maxResults: z.number().optional().describe("Maximum number of results to return"),
    })),
    widget: {
      name: "search-results",
      invoking: "Searching Hacker News...",
      invoked: "HN search complete",
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ query, maxResults }) => {
    const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    const chainResult = await dispatchDownstreamChainAndLog({
      appIds,
      toolName: "hn_search",
      toolArgs: { query, ...(maxResults != null ? { maxResults } : {}) },
      sessionId: "chatgpt",
      origin: "mcp",
    });
    if (!chainResult.ok) {
      return error(chainResult.failure ?? "Hacker News search failed.");
    }
    const raw = chainResult.finalResult.dispatch?.result as Record<string, unknown> | undefined;
    const results = Array.isArray(raw?.results) ? raw.results : [];
    return widget({
      props: { query, results, totalResults: typeof raw?.totalResults === "number" ? raw.totalResults : results.length, source: "Hacker News" },
      output: text(chainResult.finalResult.dispatch?.textPreview ?? "No results"),
    });
  }
);

server.tool(
  {
    name: "weather_forecast",
    description:
      "Get weather forecast for a location. Returns current conditions and multi-day forecast.",
    schema: zodCompat(z.object({
      location: z.string().describe("City name or location"),
      days: z.number().optional().describe("Number of forecast days"),
      unit: z.string().optional().describe("Temperature unit: celsius or fahrenheit"),
    })),
    widget: {
      name: "weather-card",
      invoking: "Fetching weather...",
      invoked: "Forecast ready",
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ location, days, unit }) => {
    const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    const chainResult = await dispatchDownstreamChainAndLog({
      appIds,
      toolName: "weather_forecast",
      toolArgs: { location, ...(days != null ? { days } : {}), ...(unit != null ? { unit } : {}) },
      sessionId: "chatgpt",
      origin: "mcp",
    });
    if (!chainResult.ok) {
      return error(chainResult.failure ?? "Weather forecast failed.");
    }
    const raw = chainResult.finalResult.dispatch?.result as Record<string, unknown> | undefined;
    return widget({
      props: { location, unit, current: raw?.current, forecast: Array.isArray(raw?.forecast) ? raw.forecast : [] },
      output: text(chainResult.finalResult.dispatch?.textPreview ?? "No forecast"),
    });
  }
);

server.tool(
  {
    name: "github_repo_info",
    description:
      "Get information about a GitHub repository including stars, forks, language, and description.",
    schema: zodCompat(z.object({
      repo: z.string().describe("Repository in owner/name format (e.g. 'facebook/react')"),
    })),
    widget: {
      name: "github-card",
      invoking: "Loading repository...",
      invoked: "Repository info ready",
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ repo }) => {
    const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    const chainResult = await dispatchDownstreamChainAndLog({
      appIds,
      toolName: "github_repo_info",
      toolArgs: { repo },
      sessionId: "chatgpt",
      origin: "mcp",
    });
    if (!chainResult.ok) {
      return error(chainResult.failure ?? "GitHub repo info failed.");
    }
    const raw = chainResult.finalResult.dispatch?.result as Record<string, unknown> | undefined;
    return widget({
      props: {
        name: typeof raw?.name === "string" ? raw.name : repo,
        fullName: raw?.fullName ?? raw?.full_name,
        description: raw?.description,
        url: raw?.url ?? raw?.html_url,
        stars: raw?.stars ?? raw?.stargazers_count,
        forks: raw?.forks ?? raw?.forks_count,
        openIssues: raw?.openIssues ?? raw?.open_issues_count,
        language: raw?.language,
        license: typeof raw?.license === "object" && raw?.license != null ? (raw.license as Record<string, unknown>).name ?? raw.license : raw?.license,
        updatedAt: raw?.updatedAt ?? raw?.updated_at,
        owner: typeof raw?.owner === "object" && raw?.owner != null ? (raw.owner as Record<string, unknown>).login ?? raw.owner : raw?.owner,
        topics: Array.isArray(raw?.topics) ? raw.topics : undefined,
      },
      output: text(chainResult.finalResult.dispatch?.textPreview ?? "No repository info"),
    });
  }
);

server.tool(
  {
    name: "wikipedia_summary",
    description:
      "Get a summary of a Wikipedia article by topic or title.",
    schema: zodCompat(z.object({
      topic: z.string().describe("The Wikipedia article topic or title"),
    })),
    widget: {
      name: "wiki-card",
      invoking: "Loading article...",
      invoked: "Summary ready",
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ topic }) => {
    const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    const chainResult = await dispatchDownstreamChainAndLog({
      appIds,
      toolName: "wikipedia_summary",
      toolArgs: { topic },
      sessionId: "chatgpt",
      origin: "mcp",
    });
    if (!chainResult.ok) {
      return error(chainResult.failure ?? "Wikipedia summary failed.");
    }
    const raw = chainResult.finalResult.dispatch?.result as Record<string, unknown> | undefined;
    return widget({
      props: {
        title: typeof raw?.title === "string" ? raw.title : topic,
        summary: typeof raw?.summary === "string" ? raw.summary : (typeof raw?.extract === "string" ? raw.extract : ""),
        url: raw?.url,
        thumbnail: raw?.thumbnail,
        extract: raw?.extract,
      },
      output: text(chainResult.finalResult.dispatch?.textPreview ?? "No summary"),
    });
  }
);

server.tool(
  {
    name: "arxiv_search",
    description:
      "Search arXiv for academic papers. Returns papers with titles, authors, and abstracts.",
    schema: zodCompat(z.object({
      query: z.string().describe("The search query for academic papers"),
      maxResults: z.number().optional().describe("Maximum number of results to return"),
    })),
    widget: {
      name: "arxiv-results",
      invoking: "Searching arXiv...",
      invoked: "Papers found",
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ query, maxResults }) => {
    const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    const chainResult = await dispatchDownstreamChainAndLog({
      appIds,
      toolName: "arxiv_search",
      toolArgs: { query, ...(maxResults != null ? { maxResults } : {}) },
      sessionId: "chatgpt",
      origin: "mcp",
    });
    if (!chainResult.ok) {
      return error(chainResult.failure ?? "arXiv search failed.");
    }
    const raw = chainResult.finalResult.dispatch?.result as Record<string, unknown> | undefined;
    const results = Array.isArray(raw?.results) ? raw.results : [];
    return widget({
      props: { query, results, totalResults: typeof raw?.totalResults === "number" ? raw.totalResults : results.length },
      output: text(chainResult.finalResult.dispatch?.textPreview ?? "No results"),
    });
  }
);

server.tool(
  {
    name: "openlibrary_search",
    description:
      "Search OpenLibrary for books. Returns books with authors, publication year, and ISBNs.",
    schema: zodCompat(z.object({
      query: z.string().describe("The book search query"),
      maxResults: z.number().optional().describe("Maximum number of results to return"),
    })),
    widget: {
      name: "book-results",
      invoking: "Searching books...",
      invoked: "Books found",
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ query, maxResults }) => {
    const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    const chainResult = await dispatchDownstreamChainAndLog({
      appIds,
      toolName: "openlibrary_search",
      toolArgs: { query, ...(maxResults != null ? { maxResults } : {}) },
      sessionId: "chatgpt",
      origin: "mcp",
    });
    if (!chainResult.ok) {
      return error(chainResult.failure ?? "OpenLibrary search failed.");
    }
    const raw = chainResult.finalResult.dispatch?.result as Record<string, unknown> | undefined;
    const results = Array.isArray(raw?.results) ? raw.results : [];
    return widget({
      props: { query, results, totalResults: typeof raw?.totalResults === "number" ? raw.totalResults : results.length },
      output: text(chainResult.finalResult.dispatch?.textPreview ?? "No results"),
    });
  }
);

// ── dispatch_downstream_tool ────────────────────────────────────────────────

server.tool(
  {
    name: "dispatch_downstream_tool",
    description:
      "Dispatch a tool call to one or more downstream MCP apps via Maple in execution order, then normalize, score, and log outputs into Maple traces.",
    schema: zodCompat(dispatchDownstreamToolInputSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ appId, chainAppIds, toolName, arguments: toolArgs, sessionId, traceId }) => {
    if (mcpRouteLockEnabled) {
      const overrideAttempted = Boolean(asString(appId)) || parseAppIdList(chainAppIds).length > 0;
      if (overrideAttempted) {
        return error(
          "MCP route-lock is enabled. dispatch_downstream_tool rejects appId/chainAppIds overrides; use configured route."
        );
      }
    }

    let appIds: string[];
    try {
      appIds = resolveDispatchAppIds({
        explicitChain: mcpRouteLockEnabled ? undefined : chainAppIds,
        fallbackAppId: mcpRouteLockEnabled ? undefined : appId,
        includeDefaultExecutionOrder: true,
      });
    } catch (resolutionError) {
      return error(errorMessage(resolutionError));
    }

    try {
      const chainResult = await dispatchDownstreamChainAndLog({
        appIds,
        toolName,
        toolArgs,
        sessionId,
        traceId,
        origin: "mcp",
      });
      const result = chainResult.finalResult;

      if (!chainResult.ok) {
        if (chainResult.blockedByPolicy) {
          return error(
            `Policy blocked ${result.app.id}.${toolName} before execution: ${
              result.preExecutionDecision.message
            } trace=${result.trace.id} preExecStep=${result.preExecutionStep.index}`
          );
        }
        return error(
          `${
            result.failure ?? "Downstream dispatch failed."
          } trace=${result.trace.id} step=${result.step.index} preExecStep=${result.preExecutionStep.index}`
        );
      }

      return object({
        appId: result.app.id,
        chainAppIds: chainResult.appIds,
        chainStages: chainResult.stages,
        blocked: false,
        executeAllowed: true,
        blockedByPolicy: false,
        policyWouldBlock: result.preExecutionWouldBlock,
        toolName,
        traceId: result.trace.id,
        sessionId: result.trace.sessionId,
        stepIndex: result.step.index,
        preExecutionStepIndex: result.preExecutionStep.index,
        policy: toPolicySnapshot(result.preExecutionDecision),
        overallRiskScore: result.report.overallRiskScore,
        severity: result.report.severity,
        dispatch: {
          requestId: result.dispatch?.requestId,
          responseStatus: result.dispatch?.responseStatus,
          durationMs: result.dispatch?.durationMs,
        },
        resultPreview: result.dispatch?.textPreview,
        result: result.dispatch?.result,
      });
    } catch (dispatchError) {
      return error(`Downstream dispatch could not be completed: ${errorMessage(dispatchError)}`);
    }
  }
);

// ── list_traces ─────────────────────────────────────────────────────────────

server.tool(
  {
    name: "list_traces",
    description: "List recent traces and risk metadata.",
    schema: zodCompat(listTracesInputSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ limit, sessionId }) => {
    const traces = listTracesForCurrentOwner(limit, sessionId);
    return object({
      count: traces.length,
      traces: traces.map((trace) => toTraceSummary(trace)),
    });
  }
);

// ── export_trace ────────────────────────────────────────────────────────────

server.tool(
  {
    name: "export_trace",
    description: "Export a trace in JSON or Markdown format for sharing and debugging.",
    schema: zodCompat(exportTraceInputSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ traceId, format }) => {
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
  }
);
