/**
 * Cross-Agent Behavioral Anomaly Detection
 *
 * Detects when Agent B's behavior converges with Agent A's baseline,
 * indicating possible lateral movement via inter-agent contamination.
 *
 * Uses existing FNV-based embeddings from embeddings.js.
 * Known limitation: 64-dim feature hashing has limited semantic fidelity.
 */

import { textToEmbedding, averageEmbeddings, cosineSimilarity } from "./embeddings.js";

const DEFAULT_HIGH_THRESHOLD = 0.55;
const DEFAULT_CRITICAL_THRESHOLD = 0.7;

/**
 * Build a behavioral baseline for an agent from its trace steps.
 * Returns a centroid embedding representing the agent's typical behavior.
 */
export function buildAgentBaseline(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return null;
  }
  const embeddings = steps.map((step) => {
    const corpus = JSON.stringify({
      type: step.type,
      command: step.command,
      toolCall: step.toolCall,
      externalUrl: step.externalUrl,
    });
    return textToEmbedding(corpus);
  });
  return {
    embedding: averageEmbeddings(embeddings),
    stepCount: steps.length,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Detect cross-agent behavioral mimicry.
 *
 * Compares the current agent's behavior against all other agents' baselines.
 * Flags when similarity exceeds threshold (high at 0.55, critical at 0.7).
 *
 * @param {string} agentId - The current agent's identifier
 * @param {Array} currentSteps - Current agent's trace steps
 * @param {Map|Object} agentBaselineMap - Map of agentId → { embedding, stepCount }
 * @param {number} [threshold] - Custom similarity threshold (default: 0.55)
 * @returns {Array} Array of anomaly findings
 */
export function detectCrossAgentAnomaly(agentId, currentSteps, agentBaselineMap, threshold) {
  const findings = [];
  const highThreshold = threshold ?? DEFAULT_HIGH_THRESHOLD;

  if (!currentSteps || currentSteps.length === 0) {
    return findings;
  }

  const currentBaseline = buildAgentBaseline(currentSteps);
  if (!currentBaseline) {
    return findings;
  }

  const baselines = agentBaselineMap instanceof Map
    ? agentBaselineMap
    : new Map(Object.entries(agentBaselineMap ?? {}));

  for (const [otherAgentId, otherBaseline] of baselines) {
    if (otherAgentId === agentId) continue;
    if (!otherBaseline?.embedding) continue;

    const similarity = cosineSimilarity(currentBaseline.embedding, otherBaseline.embedding);

    if (similarity >= highThreshold) {
      const severity = similarity >= DEFAULT_CRITICAL_THRESHOLD ? "critical" : "high";
      findings.push({
        type: "cross_agent_mimicry",
        severity,
        agentId,
        mimickedAgentId: otherAgentId,
        similarity: Math.round(similarity * 1000) / 1000,
        stepCount: currentSteps.length,
        flag: {
          id: `cross-agent-mimicry-${agentId}-${otherAgentId}`,
          type: "cross_agent_mimicry",
          severity,
          stepIndex: currentSteps.length - 1,
          message: `Agent '${agentId}' behavior converges with agent '${otherAgentId}' (similarity: ${(similarity * 100).toFixed(1)}%). Possible lateral movement via inter-agent contamination.`,
          recommendation: "Isolate agent, inspect inter-agent messages, and require human review before continuing.",
          evidence: `cosine_similarity=${similarity.toFixed(4)}, steps=${currentSteps.length}`,
        },
      });
    }
  }

  return findings;
}
//# sourceMappingURL=cross-agent-detector.js.map
