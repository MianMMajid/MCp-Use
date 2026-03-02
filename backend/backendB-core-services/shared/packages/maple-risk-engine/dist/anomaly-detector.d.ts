import type { RiskFlag, TraceStep } from "@maple/types";
import { type EmbeddingVector } from "./embeddings.js";
export interface EmbeddingAnomaly {
    stepIndex: number;
    similarity: number;
    anomalyScore: number;
    flag?: RiskFlag;
}
export declare function getTraceEmbedding(steps: TraceStep[]): EmbeddingVector;
export declare function detectEmbeddingAnomalies(steps: TraceStep[], communityBaselines?: EmbeddingVector[], threshold?: number): EmbeddingAnomaly[];
//# sourceMappingURL=anomaly-detector.d.ts.map