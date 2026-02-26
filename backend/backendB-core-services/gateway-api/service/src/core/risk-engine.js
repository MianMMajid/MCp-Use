/**
 * Lightweight risk scoring helpers used by the anonymizer and
 * shared-trace store.
 */
export function deriveSeverityFromScore(score) {
    if (score >= 80)
        return "critical";
    if (score >= 60)
        return "high";
    if (score >= 40)
        return "medium";
    return "low";
}
//# sourceMappingURL=risk-engine.js.map