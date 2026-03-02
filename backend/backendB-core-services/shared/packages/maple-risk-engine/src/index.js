import { detectEmbeddingAnomalies } from "./ml/anomaly-detector.js";
const severityWeight = {
    low: 15,
    medium: 35,
    high: 65,
    critical: 90,
};
const riskRules = [
    {
        type: "destructive_shell",
        severity: "critical",
        pattern: /\brm\s+-rf\s+\/|\bdd\s+if=|\bmkfs\b|:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*}\s*;\s*:/i,
        message: "Potentially destructive shell command detected.",
        recommendation: "Block execution and require explicit human approval.",
    },
    {
        type: "remote_code_execution",
        severity: "critical",
        pattern: /(curl|wget)[^\n|]*\|\s*(bash|sh)|powershell\s+-enc/i,
        message: "Piped remote script execution pattern detected.",
        recommendation: "Quarantine this step and validate source integrity.",
    },
    {
        type: "privilege_escalation",
        severity: "high",
        pattern: /\bsudo\b|\bchmod\s+777\b|\bchown\s+root\b/i,
        message: "Privilege escalation command detected.",
        recommendation: "Require human review before allowing elevated operations.",
    },
    {
        type: "credential_access",
        severity: "high",
        pattern: /cat\s+.*(\.env|id_rsa|\.aws\/credentials)|printenv|env\s*\||\btoken\b|\bsecret\b/i,
        message: "Credentials or secret material may be accessed.",
        recommendation: "Mask secrets and isolate this trace from external network actions.",
    },
    {
        type: "data_exfiltration",
        severity: "high",
        pattern: /(scp|rsync|curl|wget)[^\n]*(\.env|id_rsa|credentials|token|secret)/i,
        message: "Potential data exfiltration pattern detected.",
        recommendation: "Block outbound transfer and inspect payload intent.",
    },
    {
        type: "suspicious_network_target",
        severity: "medium",
        pattern: /https?:\/\/(\d{1,3}\.){3}\d{1,3}/i,
        message: "Direct IP-based network call detected.",
        recommendation: "Validate destination trust and constrain outbound domains.",
    },
    {
        type: "untrusted_source_download",
        severity: "medium",
        pattern: /(pastebin|raw\.githubusercontent|gist\.github|mega\.nz|anonfiles)/i,
        message: "Download or request from an untrusted source.",
        recommendation: "Pin trusted domains and add checksum verification.",
    },
    {
        type: "external_browser_action",
        severity: "low",
        pattern: /\b(open|visit|browse|navigate)\b.*https?:\/\//i,
        message: "External browser navigation detected.",
        recommendation: "Record destination and enforce allowlist policies.",
    },
];
function stepToCorpus(step) {
    return JSON.stringify({
        prompt: step.prompt,
        output: step.output,
        command: step.command,
        externalUrl: step.externalUrl,
        toolCall: step.toolCall,
        metadata: step.metadata,
    }, null, 2);
}
function buildFlag(rule, step, match, occurrence) {
    return {
        id: `${rule.type}-${step.index}-${occurrence}`,
        type: rule.type,
        severity: rule.severity,
        stepIndex: step.index,
        message: rule.message,
        recommendation: rule.recommendation,
        evidence: match,
    };
}
function deriveStepScore(flags) {
    if (flags.length === 0) {
        return 0;
    }
    const maxSeverityScore = Math.max(...flags.map((flag) => severityWeight[flag.severity]));
    const multiplier = Math.max(flags.length - 1, 0) * 8;
    return Math.min(100, maxSeverityScore + multiplier);
}
export function deriveSeverityFromScore(score) {
    if (score >= 80) {
        return "critical";
    }
    if (score >= 60) {
        return "high";
    }
    if (score >= 35) {
        return "medium";
    }
    return "low";
}
function buildBreakdown(flags) {
    return flags.reduce((acc, flag) => {
        acc[flag.severity] += 1;
        return acc;
    }, { critical: 0, high: 0, medium: 0, low: 0 });
}
function dedupeRecommendations(flags) {
    const recommendations = new Set(flags.map((flag) => flag.recommendation));
    if (recommendations.size === 0) {
        recommendations.add("No high-risk behaviors detected. Continue monitoring.");
    }
    return [...recommendations].slice(0, 6);
}
export function analyzeTraceRisks(steps, options = {}) {
    const stepResults = [];
    const allFlags = [];
    const commandFrequency = new Map();
    for (const step of steps) {
        const corpus = stepToCorpus(step);
        const flags = [];
        const seenFlagKeys = new Set();
        const pushFlag = (flag) => {
            const key = `${flag.id}|${flag.type}|${flag.stepIndex}|${flag.message}`;
            if (seenFlagKeys.has(key)) {
                return;
            }
            seenFlagKeys.add(key);
            flags.push(flag);
        };
        for (const existing of step.riskFlags ?? []) {
            if (existing.type.startsWith("firewall_")) {
                pushFlag(existing);
            }
        }
        let occurrence = flags.length;
        for (const rule of riskRules) {
            const match = corpus.match(rule.pattern);
            if (match) {
                occurrence += 1;
                pushFlag(buildFlag(rule, step, match[0], occurrence));
            }
        }
        if (step.command) {
            const count = (commandFrequency.get(step.command) ?? 0) + 1;
            commandFrequency.set(step.command, count);
            if (count >= 3) {
                pushFlag({
                    id: `repeat-command-${step.index}`,
                    type: "repeat_command_loop",
                    severity: "medium",
                    stepIndex: step.index,
                    message: "Repeated command loop detected.",
                    recommendation: "Pause execution and inspect possible runaway automation.",
                    evidence: step.command,
                });
            }
        }
        const stepScore = deriveStepScore(flags);
        stepResults.push({
            stepIndex: step.index,
            riskScore: stepScore,
            flags,
        });
        allFlags.push(...flags);
    }
    for (let i = 1; i < stepResults.length; i += 1) {
        const previous = stepResults[i - 1];
        const current = stepResults[i];
        if (current.riskScore - previous.riskScore >= 40) {
            const anomalyFlag = {
                id: `risk-spike-${current.stepIndex}`,
                type: "risk_spike",
                severity: "medium",
                stepIndex: current.stepIndex,
                message: "Sudden jump in risk profile between adjacent steps.",
                recommendation: "Insert human approval before this step.",
                evidence: `Step ${previous.stepIndex} -> ${current.stepIndex}`,
            };
            const hasRiskSpike = current.flags.some((flag) => flag.id === anomalyFlag.id);
            if (!hasRiskSpike) {
                current.flags.push(anomalyFlag);
                allFlags.push(anomalyFlag);
            }
            current.riskScore = deriveStepScore(current.flags);
        }
    }
    const embeddingFindings = detectEmbeddingAnomalies(steps, options.communityBaselines ?? [], options.embeddingThreshold);
    for (const finding of embeddingFindings) {
        if (!finding.flag) {
            continue;
        }
        const stepResult = stepResults.find((result) => result.stepIndex === finding.stepIndex);
        if (!stepResult) {
            continue;
        }
        const hasExisting = stepResult.flags.some((flag) => flag.id === finding.flag?.id);
        if (!hasExisting) {
            stepResult.flags.push(finding.flag);
            allFlags.push(finding.flag);
        }
        stepResult.riskScore = deriveStepScore(stepResult.flags);
    }
    const breakdown = buildBreakdown(allFlags);
    const maxStepScore = Math.max(0, ...stepResults.map((result) => result.riskScore));
    const overallRiskScore = Math.min(100, Math.round(maxStepScore * 0.55 +
        breakdown.critical * 18 +
        breakdown.high * 9 +
        breakdown.medium * 4 +
        breakdown.low * 1));
    const severity = deriveSeverityFromScore(overallRiskScore);
    const recommendations = dedupeRecommendations(allFlags);
    const summary = allFlags.length === 0
        ? "No suspicious actions detected in this trace."
        : `${allFlags.length} risk flag(s) detected across ${steps.length} step(s). Highest severity: ${severity}.`;
    return {
        overallRiskScore,
        severity,
        summary,
        recommendations,
        flags: allFlags.sort((a, b) => b.stepIndex - a.stepIndex),
        stepResults,
        breakdown,
    };
}
export function applyAuditToTrace(trace, report) {
    const lookup = new Map(report.stepResults.map((result) => [result.stepIndex, result]));
    for (const step of trace.steps) {
        const stepReport = lookup.get(step.index);
        if (!stepReport) {
            continue;
        }
        step.riskScore = stepReport.riskScore;
        step.riskFlags = stepReport.flags;
    }
    trace.metadata = {
        ...(trace.metadata ?? {}),
        overallRiskScore: report.overallRiskScore,
        riskSeverity: report.severity,
        lastAuditAt: new Date().toISOString(),
    };
    return trace;
}
//# sourceMappingURL=risk-engine.js.map