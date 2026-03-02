export const EMBEDDING_DIM = 64;
function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
export function tokenize(text) {
    const normalized = text.toLowerCase();
    const tokens = normalized.match(/[a-z0-9_./:-]{2,}/g);
    return tokens ?? [];
}
export function normalizeVector(vector) {
    const magnitude = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0));
    if (magnitude === 0) {
        return vector;
    }
    return vector.map((value) => value / magnitude);
}
export function textToEmbedding(text, dimension = EMBEDDING_DIM) {
    const vector = new Array(dimension).fill(0);
    const tokens = tokenize(text);
    for (const token of tokens) {
        const hash = stableHash(token);
        const index = hash % dimension;
        const sign = (hash & 1) === 0 ? 1 : -1;
        const weight = Math.min(3, Math.max(1, token.length / 5));
        vector[index] += sign * weight;
    }
    return normalizeVector(vector);
}
export function averageEmbeddings(vectors) {
    if (vectors.length === 0) {
        return new Array(EMBEDDING_DIM).fill(0);
    }
    const dimension = vectors[0].length;
    const centroid = new Array(dimension).fill(0);
    for (const vector of vectors) {
        for (let index = 0; index < dimension; index += 1) {
            centroid[index] += vector[index] ?? 0;
        }
    }
    const averaged = centroid.map((value) => value / vectors.length);
    return normalizeVector(averaged);
}
export function cosineSimilarity(a, b) {
    const dimension = Math.min(a.length, b.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let index = 0; index < dimension; index += 1) {
        dot += (a[index] ?? 0) * (b[index] ?? 0);
        normA += (a[index] ?? 0) * (a[index] ?? 0);
        normB += (b[index] ?? 0) * (b[index] ?? 0);
    }
    if (normA === 0 || normB === 0) {
        return 0;
    }
    return dot / Math.sqrt(normA * normB);
}
//# sourceMappingURL=embeddings.js.map