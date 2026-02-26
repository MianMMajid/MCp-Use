/**
 * Trace-level anomaly detection via embeddings.
 *
 * Builds a composite embedding for a trace by averaging step-level
 * text embeddings.  This is a lightweight placeholder; a production
 * system would use a dedicated ML model.
 */
import { textToEmbedding, cosineSimilarity } from "./embeddings.js";
/** Produce a fixed-length embedding vector that summarises a trace. */
export function getTraceEmbedding(steps) {
    if (steps.length === 0) {
        return textToEmbedding("");
    }
    const texts = steps.map((s) => {
        const parts = [];
        if (s.prompt)
            parts.push(s.prompt);
        if (s.command)
            parts.push(s.command);
        if (s.toolCall?.name)
            parts.push(s.toolCall.name);
        if (s.output)
            parts.push(String(s.output).slice(0, 200));
        return parts.join(" ");
    });
    // Average all step embeddings
    const dim = textToEmbedding("").length;
    const sum = new Array(dim).fill(0);
    for (const t of texts) {
        const vec = textToEmbedding(t);
        for (let i = 0; i < dim; i++) {
            sum[i] += vec[i];
        }
    }
    const n = texts.length || 1;
    const avg = sum.map((v) => v / n);
    // L2 normalise
    const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0)) || 1;
    return avg.map((v) => v / norm);
}
/** Compare two trace embeddings and return a similarity score [0,1]. */
export function traceEmbeddingSimilarity(a, b) {
    return cosineSimilarity(a, b);
}
//# sourceMappingURL=anomaly-detector.js.map