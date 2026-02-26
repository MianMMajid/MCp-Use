import { randomUUID } from "node:crypto";
import { cosineSimilarity, textToEmbedding } from "../ml/embeddings.js";
function scoreSuggestion(trace, similarity, prevalence) {
    const safetyLift = Math.max(0, 100 - trace.riskScore);
    return Math.min(100, Math.round(similarity * 50 + prevalence * 12 + safetyLift * 0.35));
}
function topTools(steps) {
    const frequency = new Map();
    for (const step of steps) {
        if (!step.toolName) {
            continue;
        }
        frequency.set(step.toolName, (frequency.get(step.toolName) ?? 0) + 1);
    }
    return [...frequency.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);
}
function inferGuardrails(trace) {
    const guards = new Set();
    for (const step of trace.steps) {
        for (const flag of step.flagTypes) {
            if (flag.includes("shell") || flag.includes("execution")) {
                guards.add("Require human approval before shell execution.");
            }
            if (flag.includes("credential") || flag.includes("exfiltration")) {
                guards.add("Mask secrets and block outbound transfer of sensitive files.");
            }
            if (flag.includes("network") || flag.includes("download")) {
                guards.add("Restrict network calls to an explicit domain allowlist.");
            }
            if (flag.includes("anomaly")) {
                guards.add("Trigger automatic replay/fork when embedding anomaly score exceeds threshold.");
            }
        }
    }
    if (guards.size === 0) {
        guards.add("Keep default guard mode: pending approval for privileged actions.");
    }
    return [...guards].slice(0, 4);
}
function bootstrapSuggestion() {
    return [
        {
            id: randomUUID(),
            title: "Bootstrap Guarded Skill",
            description: "No community traces yet. Start by sharing successful traces to unlock data-driven skill evolution.",
            confidence: 52,
            adoptionScore: 45,
            suggestedPromptPatch: "Always produce a plan, classify risk per action, and request approval before high-privilege tools.",
            guardrails: [
                "Require allowlist for outbound network requests.",
                "Block shell commands containing destructive patterns.",
            ],
            evidenceTraceIds: [],
        },
    ];
}
export function suggestEvolvedSkillsFromSharedTraces(traces, query, options = {}) {
    const limit = options.limit ?? 3;
    const minConfidence = options.minConfidence ?? 0.4;
    const queryEmbedding = textToEmbedding(query);
    if (traces.length === 0) {
        return bootstrapSuggestion();
    }
    const scored = traces
        .map((trace) => ({
        trace,
        similarity: cosineSimilarity(queryEmbedding, trace.embedding),
    }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, Math.max(limit * 4, 6));
    const prevalenceBySignature = new Map();
    for (const { trace } of scored) {
        prevalenceBySignature.set(trace.behaviorSignature, (prevalenceBySignature.get(trace.behaviorSignature) ?? 0) + 1);
    }
    const suggestions = [];
    const emittedSignatures = new Set();
    for (const { trace, similarity } of scored) {
        if (similarity < minConfidence) {
            continue;
        }
        if (emittedSignatures.has(trace.behaviorSignature)) {
            continue;
        }
        emittedSignatures.add(trace.behaviorSignature);
        const prevalence = prevalenceBySignature.get(trace.behaviorSignature) ?? 1;
        const tools = topTools(trace.steps);
        const guardrails = inferGuardrails(trace);
        const confidence = Math.min(99, Math.round(similarity * 100));
        suggestions.push({
            id: randomUUID(),
            title: `${trace.taskLabel} - evolved skill`,
            description: tools.length > 0
                ? `Optimized workflow based on shared traces using ${tools.join(", ")} with strengthened safety controls.`
                : "Optimized workflow synthesized from similar shared traces.",
            confidence,
            adoptionScore: scoreSuggestion(trace, similarity, prevalence),
            suggestedPromptPatch: [
                "Generate a numbered plan before calling tools.",
                "Annotate each step with expected risk and fallback.",
                guardrails[0],
            ].join(" "),
            guardrails,
            evidenceTraceIds: [trace.id],
        });
        if (suggestions.length >= limit) {
            break;
        }
    }
    return suggestions.slice(0, limit);
}
//# sourceMappingURL=shared-trace-store-suggestions.js.map