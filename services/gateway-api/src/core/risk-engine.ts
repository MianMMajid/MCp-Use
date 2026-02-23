/**
 * Lightweight risk scoring helpers used by the anonymizer and
 * shared-trace store.
 */

import type { RiskSeverity } from "@maple/types";

export function deriveSeverityFromScore(score: number): RiskSeverity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}
