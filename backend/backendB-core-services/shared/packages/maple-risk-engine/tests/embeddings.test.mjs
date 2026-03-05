import test from "node:test";
import assert from "node:assert/strict";

import {
  textToEmbedding,
  cosineSimilarity,
  averageEmbeddings,
  tokenize,
  normalizeVector,
  EMBEDDING_DIM,
} from "../src/ml/embeddings.js";

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

test("tokenize: splits and lowercases tokens (min 2 chars)", () => {
  assert.deepEqual(tokenize("Hello World 123"), ["hello", "world", "123"]);
});

test("tokenize: single-char tokens excluded", () => {
  assert.deepEqual(tokenize("a"), []);
});

// ---------------------------------------------------------------------------
// textToEmbedding
// ---------------------------------------------------------------------------

test("textToEmbedding: returns 64-dim vector", () => {
  const vec = textToEmbedding("test input");
  assert.equal(vec.length, EMBEDDING_DIM);
});

test("textToEmbedding: deterministic for same input", () => {
  const a = textToEmbedding("hello world");
  const b = textToEmbedding("hello world");
  assert.deepEqual(a, b);
});

test("textToEmbedding: normalized (L2 norm approx 1.0)", () => {
  const vec = textToEmbedding("some text here");
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  assert.ok(Math.abs(norm - 1.0) < 0.001, `expected norm ~1.0, got ${norm}`);
});

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

test("cosineSimilarity: identical vectors yield 1.0", () => {
  const vec = textToEmbedding("identical");
  const sim = cosineSimilarity(vec, vec);
  assert.ok(Math.abs(sim - 1.0) < 0.001, `expected ~1.0, got ${sim}`);
});

test("cosineSimilarity: same text embeddings yield 1.0", () => {
  const a = textToEmbedding("same text");
  const b = textToEmbedding("same text");
  const sim = cosineSimilarity(a, b);
  assert.ok(Math.abs(sim - 1.0) < 0.001);
});

test("cosineSimilarity: similar text more similar than dissimilar text", () => {
  const base = textToEmbedding("curl http://api");
  const similar = textToEmbedding("wget http://api");
  const dissimilar = textToEmbedding("hello world poetry");

  const simScore = cosineSimilarity(base, similar);
  const dissimScore = cosineSimilarity(base, dissimilar);
  assert.ok(
    simScore > dissimScore,
    `expected similar (${simScore}) > dissimilar (${dissimScore})`
  );
});

// ---------------------------------------------------------------------------
// averageEmbeddings
// ---------------------------------------------------------------------------

test("averageEmbeddings: single vector returns normalized copy", () => {
  const vec = textToEmbedding("single");
  const avg = averageEmbeddings([vec]);
  const norm = Math.sqrt(avg.reduce((acc, v) => acc + v * v, 0));
  assert.ok(Math.abs(norm - 1.0) < 0.001);
});

test("averageEmbeddings: empty array returns zero vector", () => {
  const result = averageEmbeddings([]);
  assert.equal(result.length, EMBEDDING_DIM);
  assert.ok(result.every((v) => v === 0));
});

// ---------------------------------------------------------------------------
// normalizeVector
// ---------------------------------------------------------------------------

test("normalizeVector: L2 norm of result is approx 1.0", () => {
  const raw = [3, 4, 0, 0];
  const normalized = normalizeVector(raw);
  const norm = Math.sqrt(normalized.reduce((acc, v) => acc + v * v, 0));
  assert.ok(Math.abs(norm - 1.0) < 0.001);
});

test("normalizeVector: zero vector returns zero vector", () => {
  const zeroVec = [0, 0, 0, 0];
  const result = normalizeVector(zeroVec);
  assert.deepEqual(result, [0, 0, 0, 0]);
});
