import type { RiskFlag, TraceStep } from "../core/types.js";
import { averageEmbeddings, cosineSimilarity, textToEmbedding, type EmbeddingVector } from "./embeddings.js";

export interface EmbeddingAnomaly {
  stepIndex: number;
  similarity: number;
  anomalyScore: number;
  flag?: RiskFlag;
}

function stepToText(step: TraceStep): string {
  const fragments = [
    step.actor,
    step.type,
    step.prompt,
    step.command,
    step.externalUrl,
    step.toolCall?.name,
    typeof step.toolCall?.output === "string"
      ? step.toolCall.output
      : step.toolCall?.output
        ? JSON.stringify(step.toolCall.output)
        : undefined,
    step.output,
  ];

  return fragments.filter((fragment): fragment is string => Boolean(fragment)).join(" ");
}

function embeddingFlag(stepIndex: number, similarity: number): RiskFlag {
  const anomalyScore = Math.round((1 - similarity) * 100);
  const severeOutlier = similarity < 0.3;

  return {
    id: `embedding-anomaly-${stepIndex}`,
    type: "embedding_anomaly",
    severity: severeOutlier ? "high" : "medium",
    stepIndex,
    message: `Behavior diverges from baseline trace patterns (anomaly score ${anomalyScore}).`,
    recommendation:
      "Fork from this step, add explicit constraints, and require a guard approval before continuing.",
    evidence: `cosine_similarity=${similarity.toFixed(3)}`,
  };
}

export function getTraceEmbedding(steps: TraceStep[]): EmbeddingVector {
  const vectors = steps.map((step) => textToEmbedding(stepToText(step)));
  return averageEmbeddings(vectors);
}

export function detectEmbeddingAnomalies(
  steps: TraceStep[],
  communityBaselines: EmbeddingVector[] = [],
  threshold = 0.58
): EmbeddingAnomaly[] {
  const rollingBaseline = [...communityBaselines];
  const findings: EmbeddingAnomaly[] = [];

  for (const step of steps) {
    const embedding = textToEmbedding(stepToText(step));

    if (rollingBaseline.length === 0) {
      rollingBaseline.push(embedding);
      findings.push({
        stepIndex: step.index,
        similarity: 1,
        anomalyScore: 0,
      });
      continue;
    }

    const centroid = averageEmbeddings(rollingBaseline);
    const similarity = cosineSimilarity(embedding, centroid);
    const anomalyScore = Math.round((1 - similarity) * 100);

    findings.push({
      stepIndex: step.index,
      similarity,
      anomalyScore,
      flag: similarity < threshold ? embeddingFlag(step.index, similarity) : undefined,
    });

    rollingBaseline.push(embedding);
  }

  return findings;
}
