export declare const EMBEDDING_DIM = 64;
export type EmbeddingVector = number[];
export declare function tokenize(text: string): string[];
export declare function normalizeVector(vector: EmbeddingVector): EmbeddingVector;
export declare function textToEmbedding(text: string, dimension?: number): EmbeddingVector;
export declare function averageEmbeddings(vectors: EmbeddingVector[]): EmbeddingVector;
export declare function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number;
//# sourceMappingURL=embeddings.d.ts.map