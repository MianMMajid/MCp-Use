import { truncateText } from "../helpers.js";
import { formatRuleLabel, } from "./firewall-chat-context.js";
export function extractStepIndexFromQuestion(question) {
    const match = question.match(/step\s*#?\s*(\d+)/i);
    if (!match || !match[1]) {
        return null;
    }
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}
export function answerFirewallChatQuestion(question, context) {
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
        const byStep = firewall.recentBlockedSteps.find((entry) => entry.stepIndex === stepIndex);
        if (byStep) {
            return [
                `Step #${byStep.stepIndex} is blocked.`,
                `Rule: ${byStep.rule ? formatRuleLabel(byStep.rule) : "manual guard action"}.`,
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
            `Rule: ${latestBlocked.rule ? formatRuleLabel(latestBlocked.rule) : "manual guard action"}.`,
            `Reason: ${latestBlocked.reason}`,
        ].join("\n");
    }
    if (/network|web|http|https|url|request|fetch|download|upload/.test(normalized)) {
        const networkActions = context.activity?.networkActions ?? [];
        if (networkActions.length === 0) {
            return "No network actions are recorded in this trace window.";
        }
        const lines = networkActions.slice(0, 8).map((action) => {
            const surface = action.url ?? action.command ?? action.toolName ?? action.prompt ?? "unknown";
            return `#${action.stepIndex} ${action.type} ${action.actor}: ${truncateText(surface, 140)}`;
        });
        return [`Network actions (${networkActions.length} total in context):`, ...lines].join("\n");
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
        return context.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n");
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
}
export function isNetworkActionQuery(question) {
    const normalized = question.trim().toLowerCase();
    return (/(network|web|http|https|url|request|fetch|download|upload)/.test(normalized) &&
        /(action|actions|occur|occurred|happen|happened|list|show|which|what)/.test(normalized));
}
//# sourceMappingURL=firewall-chat-rules.js.map