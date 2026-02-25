/**
 * Lightweight in-process text embedding utilities.
 *
 * Uses a simple bag-of-words vector for cosine similarity comparisons.
 * This is a placeholder for a proper embedding model integration.
 */
const VOCAB_SIZE = 512;
function hashToken(token) {
    let h = 0;
    for (let i = 0; i < token.length; i++) {
        h = ((h << 5) - h + token.charCodeAt(i)) | 0;
    }
    return ((h % VOCAB_SIZE) + VOCAB_SIZE) % VOCAB_SIZE;
}
export function textToEmbedding(text) {
    const vec = new Array(VOCAB_SIZE).fill(0);
    const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
    for (const token of tokens) {
        vec[hashToken(token)] += 1;
    }
    // L2 normalize
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
}
export function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
//# sourceMappingURL=embeddings.js.map