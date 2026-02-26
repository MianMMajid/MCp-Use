export function buildYcAppBrief(metrics, focus = "full") {
    const moat = {
        thesis: "Maple compounds a proprietary safety/behavior dataset from real agent traces and replay forks.",
        points: [
            `Trace moat: ${metrics.totalObservedTraces} observed traces with replay lineage and risk labels.`,
            `Community moat: ${metrics.sharedTraces} anonymized traces and ${metrics.uniqueSignatures} unique behavior signatures.`,
            "Product moat: tighter guardrails improve every new skill suggestion and reduce unsafe executions.",
        ],
    };
    const traction = {
        thesis: "OpenClaw-native integration gives immediate distribution with high-agency users.",
        points: [
            `OpenClaw tie-in: ${metrics.openclawTraces} traces originated from OpenClaw sessions.`,
            `Safety pull: ${metrics.highRiskDetections} high-risk detections surfaced actionable interventions.`,
            `Network pull: ${metrics.evolvedSuggestionsServed} evolved skill suggestions generated from shared traces.`,
        ],
    };
    const revenue = {
        thesis: "Freemium wedge with paid controls, collaboration, and governance.",
        tiers: [
            {
                plan: "Free",
                pricePerMonthUsd: 0,
                includes: "Basic observation, limited trace history, manual exports",
            },
            {
                plan: "Pro",
                pricePerMonthUsd: 9,
                includes: "Unlimited traces, replay forks, ML anomaly alerts",
            },
            {
                plan: "Team",
                pricePerMonthUsd: 29,
                includes: "Shared workspaces, anonymized team datasets, evolved skill recommendations",
            },
            {
                plan: "Enterprise",
                pricePerMonthUsd: 99,
                includes: "Audit log retention, policy controls, custom risk rules, compliance exports",
            },
        ],
        expansion: "Land via solo developers, expand to teams needing governance for local/high-agency agents.",
    };
    if (focus === "moat") {
        return { focus, moat };
    }
    if (focus === "traction") {
        return { focus, traction };
    }
    if (focus === "revenue") {
        return { focus, revenue };
    }
    return {
        focus: "full",
        oneLiner: "Maple is the Sentry + Git layer for autonomous agents: observe, fork, audit, and evolve behavior safely.",
        moat,
        traction,
        revenue,
    };
}
//# sourceMappingURL=yc-narrative.js.map