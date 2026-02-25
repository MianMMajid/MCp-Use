import type { Trace, TraceStep } from "../../core/types.js";

export interface FirewallBlockedStepSummary {
  stepIndex: number;
  actor: TraceStep["actor"];
  type: TraceStep["type"];
  timestamp: string;
  rule: string | null;
  reason: string;
  commandOrUrl: string;
}

export interface FirewallActionSummary {
  stepIndex: number;
  actor: TraceStep["actor"];
  type: TraceStep["type"];
  timestamp: string;
  toolName: string | null;
  command: string | null;
  url: string | null;
  prompt: string;
  outputPreview: string;
  riskScore: number;
  guardStatus: TraceStep["guardStatus"];
}

export interface FirewallChatContext {
  generatedAt: string;
  trace:
    | {
        id: string;
        sessionId: string;
        source: Trace["source"];
        status: Trace["status"];
        startedAt: string;
        updatedAt: string;
        lastEventAt: string;
        stepCount: number;
        overallRiskScore: number;
        riskSeverity: string;
      }
    | null;
  firewall:
    | {
        enabled: boolean;
        defaultAction: string;
        blockedSteps: number;
        redactedSteps: number;
        highRiskSteps: number;
        guardCounts: {
          allow: number;
          block: number;
          pending: number;
        };
        ruleHits: Record<string, number>;
        topRules: Array<{ rule: string; count: number }>;
        quarantinedAt: string | null;
        lastBlockedStep: FirewallBlockedStepSummary | null;
        recentBlockedSteps: FirewallBlockedStepSummary[];
      }
    | null;
  activity:
    | {
        recentActions: FirewallActionSummary[];
        networkActions: FirewallActionSummary[];
        shellActions: FirewallActionSummary[];
      }
    | null;
  highlights: string[];
  recommendations: string[];
}

interface CreateFirewallChatContextEngineDeps {
  formatRuleLabel: (rule: string) => string;
  getLatestTraceBySessionForCurrentOwner: (sessionId: string) => Trace | undefined;
  getTraceForCurrentOwner: (traceId: string) => Trace | undefined;
  listTracesForCurrentOwner: (limit: number, sessionId?: string) => Trace[];
  stepCommandOrUrl: (step: TraceStep) => string;
  stepFirewallRule: (step: TraceStep) => string | null;
  stepGuardReason: (step: TraceStep) => string;
  toFirewallActionSummary: (step: TraceStep) => FirewallActionSummary;
  toFiniteNumber: (value: unknown, fallback?: number) => number;
  truncateText: (value: string, maxLength?: number) => string;
}

function resolveTraceForFirewallContext(
  deps: CreateFirewallChatContextEngineDeps,
  options: { traceId?: string; sessionId?: string }
): Trace | undefined {
  if (options.traceId) {
    return deps.getTraceForCurrentOwner(options.traceId);
  }
  if (options.sessionId) {
    return deps.getLatestTraceBySessionForCurrentOwner(options.sessionId);
  }
  return deps.listTracesForCurrentOwner(1)[0];
}

function buildFirewallRecommendations(
  context: FirewallChatContext,
  formatRuleLabel: (rule: string) => string
): string[] {
  if (!context.trace || !context.firewall) {
    return [
      "Start or ingest a trace first so Maple can evaluate firewall state.",
      "Use /api/firewall/decision before executing shell or network actions.",
    ];
  }

  const suggestions: string[] = [];
  if (context.firewall.blockedSteps > 0) {
    suggestions.push("Review blocked steps and keep deny decisions unless explicitly approved.");
  }
  if (context.firewall.highRiskSteps > 0) {
    suggestions.push("Run audit_risk and ml_anomaly_report to validate high-risk behavior clusters.");
  }
  if (context.firewall.redactedSteps > 0) {
    suggestions.push("Rotate credentials if redaction detected sensitive token patterns.");
  }
  if (context.trace.status !== "quarantined" && context.firewall.blockedSteps === 0) {
    suggestions.push("Keep pre-execution gating enabled to catch first risky action before execution.");
  }

  const topRule = context.firewall.topRules[0];
  if (topRule) {
    suggestions.push(`Most frequent firewall hit: ${formatRuleLabel(topRule.rule)}.`);
  }

  if (suggestions.length === 0) {
    suggestions.push("No immediate firewall actions required. Continue monitoring.");
  }
  return suggestions;
}

function extractStepIndexFromQuestion(question: string): number | null {
  const match = question.match(/step\s*#?\s*(\d+)/i);
  if (!match || !match[1]) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function createFirewallChatContextEngine(deps: CreateFirewallChatContextEngineDeps): {
  buildFirewallChatContext: (options?: { traceId?: string; sessionId?: string }) => FirewallChatContext;
  answerFirewallChatQuestion: (question: string, context: FirewallChatContext) => string;
} {
  const buildFirewallChatContext = (
    options: { traceId?: string; sessionId?: string } = {}
  ): FirewallChatContext => {
    const generatedAt = new Date().toISOString();
    const trace = resolveTraceForFirewallContext(deps, options);
    if (!trace) {
      const empty: FirewallChatContext = {
        generatedAt,
        trace: null,
        firewall: null,
        activity: null,
        highlights: ["No active trace available yet."],
        recommendations: [],
      };
      empty.recommendations = buildFirewallRecommendations(empty, deps.formatRuleLabel);
      return empty;
    }

    const overallRiskScore = deps.toFiniteNumber(
      trace.metadata?.overallRiskScore,
      Math.max(0, ...trace.steps.map((step) => deps.toFiniteNumber(step.riskScore, 0)))
    );
    const riskSeverity =
      (typeof trace.metadata?.riskSeverity === "string" && trace.metadata.riskSeverity) ||
      (overallRiskScore >= 80
        ? "critical"
        : overallRiskScore >= 60
          ? "high"
          : overallRiskScore >= 35
            ? "medium"
            : "low");
    const lastStep = trace.steps[trace.steps.length - 1];
    const lastEventAt =
      typeof lastStep?.timestamp === "string" ? lastStep.timestamp : trace.updatedAt;

    const guardCounts = {
      allow: trace.steps.filter((step) => step.guardStatus === "allow").length,
      block: trace.steps.filter((step) => step.guardStatus === "block").length,
      pending: trace.steps.filter((step) => step.guardStatus === "pending").length,
    };

    const blockedSteps = trace.steps
      .filter((step) => step.guardStatus === "block")
      .map((step) => ({
        stepIndex: step.index,
        actor: step.actor,
        type: step.type,
        timestamp: step.timestamp,
        rule: deps.stepFirewallRule(step),
        reason: deps.stepGuardReason(step),
        commandOrUrl: deps.stepCommandOrUrl(step),
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const ruleHitsFromStepScan = new Map<string, number>();
    for (const step of trace.steps) {
      const rule = deps.stepFirewallRule(step);
      if (!rule) {
        continue;
      }
      ruleHitsFromStepScan.set(rule, (ruleHitsFromStepScan.get(rule) ?? 0) + 1);
    }
    const ruleHitsFromMetadata =
      trace.metadata &&
      typeof trace.metadata.firewall === "object" &&
      trace.metadata.firewall &&
      typeof (trace.metadata.firewall as Record<string, unknown>).ruleHits === "object"
        ? ((trace.metadata.firewall as Record<string, unknown>).ruleHits as Record<string, unknown>)
        : {};

    const mergedRuleHits = new Map<string, number>(ruleHitsFromStepScan.entries());
    for (const [rule, countValue] of Object.entries(ruleHitsFromMetadata)) {
      const count = deps.toFiniteNumber(countValue, 0);
      if (count <= 0) {
        continue;
      }
      mergedRuleHits.set(rule, Math.max(count, mergedRuleHits.get(rule) ?? 0));
    }

    const ruleHits = Object.fromEntries(mergedRuleHits.entries());
    const topRules = [...mergedRuleHits.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rule, count]) => ({ rule, count }));

    const firewallMetadata =
      trace.metadata && typeof trace.metadata.firewall === "object" && trace.metadata.firewall
        ? (trace.metadata.firewall as Record<string, unknown>)
        : {};

    const redactedStepsComputed = trace.steps.filter((step) => {
      const redactedPatterns =
        step.metadata &&
        typeof step.metadata.firewall === "object" &&
        step.metadata.firewall &&
        Array.isArray((step.metadata.firewall as Record<string, unknown>).redactedPatterns)
          ? ((step.metadata.firewall as Record<string, unknown>).redactedPatterns as unknown[])
          : [];
      return redactedPatterns.length > 0;
    }).length;

    const blockedStepsCount = deps.toFiniteNumber(
      firewallMetadata.blockedSteps,
      blockedSteps.length
    );
    const redactedSteps = deps.toFiniteNumber(
      firewallMetadata.redactedSteps,
      redactedStepsComputed
    );
    const highRiskSteps = trace.steps.filter(
      (step) => deps.toFiniteNumber(step.riskScore, 0) >= 60
    ).length;
    const recentActions = trace.steps
      .slice(-20)
      .map((step) => deps.toFirewallActionSummary(step))
      .reverse();
    const networkActions = trace.steps
      .filter(
        (step) =>
          step.type === "network" ||
          Boolean(step.externalUrl) ||
          /web_search|web_fetch|wikipedia|weather|hn_search|arxiv_search|openlibrary|github_repo_info/i.test(
            step.toolCall?.name ?? ""
          )
      )
      .slice(-20)
      .map((step) => deps.toFirewallActionSummary(step))
      .reverse();
    const shellActions = trace.steps
      .filter((step) => step.type === "shell")
      .slice(-20)
      .map((step) => deps.toFirewallActionSummary(step))
      .reverse();
    const quarantinedAt =
      trace.status === "quarantined"
        ? blockedSteps[blockedSteps.length - 1]?.timestamp ?? trace.updatedAt
        : null;

    const context: FirewallChatContext = {
      generatedAt,
      trace: {
        id: trace.id,
        sessionId: trace.sessionId,
        source: trace.source,
        status: trace.status,
        startedAt: trace.startedAt,
        updatedAt: trace.updatedAt,
        lastEventAt,
        stepCount: trace.steps.length,
        overallRiskScore,
        riskSeverity,
      },
      firewall: {
        enabled:
          typeof firewallMetadata.enabled === "boolean"
            ? Boolean(firewallMetadata.enabled)
            : true,
        defaultAction:
          typeof firewallMetadata.defaultAction === "string"
            ? String(firewallMetadata.defaultAction)
            : "allow",
        blockedSteps: blockedStepsCount,
        redactedSteps,
        highRiskSteps,
        guardCounts,
        ruleHits,
        topRules,
        quarantinedAt,
        lastBlockedStep:
          blockedSteps.length > 0 ? blockedSteps[blockedSteps.length - 1] : null,
        recentBlockedSteps: blockedSteps.slice(-8).reverse(),
      },
      activity: {
        recentActions,
        networkActions,
        shellActions,
      },
      highlights: [],
      recommendations: [],
    };

    const traceSummary = context.trace!;
    const firewallSummary = context.firewall!;
    const topRule = firewallSummary.topRules[0];
    context.highlights = [
      `Trace ${traceSummary.id} (${traceSummary.source}) is ${traceSummary.status}.`,
      `Risk ${traceSummary.overallRiskScore} (${traceSummary.riskSeverity}), ${firewallSummary.blockedSteps} blocked step(s).`,
      topRule
        ? `Most frequent policy hit: ${deps.formatRuleLabel(topRule.rule)} (${topRule.count}).`
        : "No explicit firewall rule hits yet.",
    ];
    context.recommendations = buildFirewallRecommendations(context, deps.formatRuleLabel);

    return context;
  };

  const answerFirewallChatQuestion = (
    question: string,
    context: FirewallChatContext
  ): string => {
    const normalized = question.trim().toLowerCase();
    if (!context.trace || !context.firewall) {
      return [
        "No active trace is loaded yet.",
        "Start a session (demo start or observe_session), then ask again for live firewall status.",
      ].join("\n");
    }

    const trace = context.trace;
    const firewall = context.firewall;
    const latestBlocked = firewall.lastBlockedStep;
    const stepIndex = extractStepIndexFromQuestion(question);
    if (stepIndex !== null) {
      const byStep = firewall.recentBlockedSteps.find(
        (entry) => entry.stepIndex === stepIndex
      );
      if (byStep) {
        return [
          `Step #${byStep.stepIndex} is blocked.`,
          `Rule: ${byStep.rule ? deps.formatRuleLabel(byStep.rule) : "manual guard action"}.`,
          `Reason: ${byStep.reason}`,
          `Action: ${byStep.commandOrUrl}`,
        ].join("\n");
      }
      return `Step #${stepIndex} is not in the recent blocked list. Current blocked steps: ${firewall.blockedSteps}.`;
    }

    if (/status|summary|update|overview|health|what(?:'s| is)? going on/.test(normalized)) {
      return [
        `Trace ${trace.id} (${trace.source}) is ${trace.status}.`,
        `Risk score is ${trace.overallRiskScore} (${trace.riskSeverity}).`,
        `Firewall: ${firewall.blockedSteps} blocked, ${firewall.redactedSteps} redacted, ${firewall.highRiskSteps} high-risk steps.`,
        latestBlocked
          ? `Latest block: step #${latestBlocked.stepIndex} (${latestBlocked.type}) - ${latestBlocked.reason}`
          : "No blocked steps yet.",
      ].join("\n");
    }

    if (/blocked|block|deny|denied|quarantine|quarantined|why/.test(normalized)) {
      if (!latestBlocked) {
        return "No blocked steps recorded yet. Firewall default action is allow, with active deny rules for risky patterns.";
      }
      return [
        `Trace is ${trace.status}. Blocked steps: ${firewall.blockedSteps}.`,
        `Latest block: step #${latestBlocked.stepIndex} at ${latestBlocked.timestamp}.`,
        `Rule: ${latestBlocked.rule ? deps.formatRuleLabel(latestBlocked.rule) : "manual guard action"}.`,
        `Reason: ${latestBlocked.reason}`,
      ].join("\n");
    }

    if (/network|web|http|https|url|request|fetch|download|upload/.test(normalized)) {
      const networkActions = context.activity?.networkActions ?? [];
      if (networkActions.length === 0) {
        return "No network actions are recorded in this trace window.";
      }
      const lines = networkActions.slice(0, 8).map((action) => {
        const surface =
          action.url ?? action.command ?? action.toolName ?? action.prompt ?? "unknown";
        return `#${action.stepIndex} ${action.type} ${action.actor}: ${deps.truncateText(surface, 140)}`;
      });
      return [`Network actions (${networkActions.length} total in context):`, ...lines].join(
        "\n"
      );
    }

    if (/risk|severity|safe|danger|score/.test(normalized)) {
      return [
        `Current risk is ${trace.overallRiskScore} (${trace.riskSeverity}).`,
        `High-risk steps: ${firewall.highRiskSteps}.`,
        `Guard decisions: allow=${firewall.guardCounts.allow}, block=${firewall.guardCounts.block}, pending=${firewall.guardCounts.pending}.`,
      ].join("\n");
    }

    if (/latest|last|recent/.test(normalized)) {
      const latestSummary = latestBlocked
        ? `Latest blocked step #${latestBlocked.stepIndex}: ${latestBlocked.commandOrUrl}`
        : "No blocked step in the latest window.";
      return [
        `Last event: ${trace.lastEventAt}.`,
        latestSummary,
        `Trace status: ${trace.status}.`,
      ].join("\n");
    }

    if (/next|recommend|what should|mitigate|fix|action/.test(normalized)) {
      return context.recommendations
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n");
    }

    if (/source|openclaw|mock|manual/.test(normalized)) {
      return [
        `Source: ${trace.source}.`,
        `Session: ${trace.sessionId}.`,
        `Trace status: ${trace.status}.`,
        "This trace is from live or ingested runtime events.",
      ].join("\n");
    }

    return [
      context.highlights[0],
      context.highlights[1],
      context.recommendations[0],
      "Ask: 'status update', 'why blocked', 'risk summary', or 'what should we do next'.",
    ]
      .filter((entry) => Boolean(entry))
      .join("\n");
  };

  return {
    answerFirewallChatQuestion,
    buildFirewallChatContext,
  };
}
