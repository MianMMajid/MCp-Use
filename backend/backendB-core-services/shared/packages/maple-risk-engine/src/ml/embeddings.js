// ── Embedding Configuration ──────────────────────────────────────────────────
// MAPLE_EMBEDDING_MODEL: "bag-of-words" (default) | "onnx-minilm" | "remote"
// MAPLE_EMBEDDING_API_URL: URL for remote embedding service (Phase B)
// MAPLE_EMBEDDING_DIM: Override embedding dimension (default: 64 for bag-of-words)

const EMBEDDING_MODEL = process.env.MAPLE_EMBEDDING_MODEL ?? "bag-of-words";
const EMBEDDING_API_URL = process.env.MAPLE_EMBEDDING_API_URL ?? "";

export const EMBEDDING_DIM = EMBEDDING_MODEL === "bag-of-words" ? 64 : 384;

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

// ── Bag-of-Words Embedding (default) ─────────────────────────────────────────
function bagOfWordsEmbedding(text, dimension = 64) {
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

// ── ONNX MiniLM Embedding (Phase A) ─────────────────────────────────────────
let _onnxSession = null;
async function loadOnnxSession() {
    if (_onnxSession) return _onnxSession;
    try {
        const ort = await import("onnxruntime-node");
        const path = await import("node:path");
        const modelPath = process.env.MAPLE_ONNX_MODEL_PATH ??
            path.join(import.meta.dirname ?? ".", "models", "all-MiniLM-L6-v2.onnx");
        _onnxSession = await ort.InferenceSession.create(modelPath);
        return _onnxSession;
    } catch (err) {
        console.warn(`[embeddings] ONNX model load failed, falling back to bag-of-words: ${err.message}`);
        return null;
    }
}

async function onnxEmbedding(text) {
    const session = await loadOnnxSession();
    if (!session) return bagOfWordsEmbedding(text, 64);
    // Simplified tokenization for ONNX — real impl needs proper tokenizer
    const tokens = tokenize(text).slice(0, 128);
    const inputIds = new BigInt64Array(tokens.map((_, i) => BigInt(i + 1)));
    try {
        const feeds = { input_ids: new (await import("onnxruntime-node")).Tensor("int64", inputIds, [1, inputIds.length]) };
        const results = await session.run(feeds);
        const output = results.last_hidden_state ?? results.token_embeddings;
        if (!output) return bagOfWordsEmbedding(text, 64);
        const data = Array.from(output.data).slice(0, 384);
        return normalizeVector(data);
    } catch {
        return bagOfWordsEmbedding(text, 64);
    }
}

// ── Remote API Embedding (Phase B) ──────────────────────────────────────────
async function remoteEmbedding(text) {
    if (!EMBEDDING_API_URL) return bagOfWordsEmbedding(text, 64);
    try {
        const response = await fetch(EMBEDDING_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return bagOfWordsEmbedding(text, 64);
        const result = await response.json();
        const embedding = result.embedding ?? result.data?.[0]?.embedding;
        if (!Array.isArray(embedding)) return bagOfWordsEmbedding(text, 64);
        return normalizeVector(embedding);
    } catch {
        return bagOfWordsEmbedding(text, 64);
    }
}

// ── Unified textToEmbedding ─────────────────────────────────────────────────
export function textToEmbedding(text, dimension = EMBEDDING_DIM) {
    if (EMBEDDING_MODEL === "onnx-minilm") {
        // ONNX path is async but we keep sync signature for compatibility
        // Callers that need ONNX should use textToEmbeddingAsync
        return bagOfWordsEmbedding(text, dimension);
    }
    return bagOfWordsEmbedding(text, dimension);
}

export async function textToEmbeddingAsync(text) {
    if (EMBEDDING_MODEL === "remote" && EMBEDDING_API_URL) {
        return remoteEmbedding(text);
    }
    if (EMBEDDING_MODEL === "onnx-minilm") {
        return onnxEmbedding(text);
    }
    return bagOfWordsEmbedding(text, EMBEDDING_DIM);
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