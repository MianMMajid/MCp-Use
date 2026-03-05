import test from "node:test";
import assert from "node:assert/strict";

const { loadApiKeysFromEnv, extractApiKeyFromHeaders, verifyApiKey } = await import(
  `../src/api-key.js?t=${Date.now()}`
);

// ── loadApiKeysFromEnv ───────────────────────────────────────────────────────

test("loadApiKeysFromEnv: single key from MAPLE_API_KEY", async () => {
  const env = { MAPLE_API_KEY: "test-key-abc" };
  const keys = loadApiKeysFromEnv(env);
  assert.deepStrictEqual(keys, ["test-key-abc"]);
});

test("loadApiKeysFromEnv: multiple from MAPLE_API_KEYS (comma-separated)", async () => {
  const env = { MAPLE_API_KEYS: "key-alpha,key-beta,key-gamma" };
  const keys = loadApiKeysFromEnv(env);
  assert.deepStrictEqual(keys, ["key-alpha", "key-beta", "key-gamma"]);
});

test("loadApiKeysFromEnv: deduplicates keys from MAPLE_API_KEY and MAPLE_API_KEYS", async () => {
  const env = { MAPLE_API_KEY: "shared-key", MAPLE_API_KEYS: "shared-key,other-key" };
  const keys = loadApiKeysFromEnv(env);
  assert.equal(keys.length, 2);
  assert.ok(keys.includes("shared-key"));
  assert.ok(keys.includes("other-key"));
});

test("loadApiKeysFromEnv: empty env returns empty array", async () => {
  const keys = loadApiKeysFromEnv({});
  assert.deepStrictEqual(keys, []);
});

test("loadApiKeysFromEnv: quote unwrapping ('\"my-key\"' becomes 'my-key')", async () => {
  const env = { MAPLE_API_KEY: '"my-key"' };
  const keys = loadApiKeysFromEnv(env);
  assert.deepStrictEqual(keys, ["my-key"]);
});

test("loadApiKeysFromEnv: single-quote unwrapping", async () => {
  const env = { MAPLE_API_KEY: "'my-key'" };
  const keys = loadApiKeysFromEnv(env);
  assert.deepStrictEqual(keys, ["my-key"]);
});

// ── extractApiKeyFromHeaders ─────────────────────────────────────────────────

test("extractApiKeyFromHeaders: x-api-key header", async () => {
  const key = extractApiKeyFromHeaders("my-api-key-123", undefined);
  assert.equal(key, "my-api-key-123");
});

test("extractApiKeyFromHeaders: Authorization Bearer header", async () => {
  const key = extractApiKeyFromHeaders(undefined, "Bearer my-bearer-token");
  assert.equal(key, "my-bearer-token");
});

test("extractApiKeyFromHeaders: x-api-key takes precedence over Authorization", async () => {
  const key = extractApiKeyFromHeaders("from-x-api-key", "Bearer from-bearer");
  assert.equal(key, "from-x-api-key");
});

test("extractApiKeyFromHeaders: no header returns undefined", async () => {
  const key = extractApiKeyFromHeaders(undefined, undefined);
  assert.equal(key, undefined);
});

test("extractApiKeyFromHeaders: invalid Authorization format returns undefined", async () => {
  const key = extractApiKeyFromHeaders(undefined, "Basic user:pass");
  assert.equal(key, undefined);
});

// ── verifyApiKey ─────────────────────────────────────────────────────────────

test("verifyApiKey: correct key returns ok true with keyFingerprint", async () => {
  const result = verifyApiKey(["secret-key-123"], "secret-key-123");
  assert.equal(result.ok, true);
  assert.ok(typeof result.keyFingerprint === "string");
  assert.ok(result.keyFingerprint.length > 0);
});

test("verifyApiKey: wrong key returns ok false with reason invalid_key", async () => {
  const result = verifyApiKey(["correct-key"], "wrong-key");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_key");
});

test("verifyApiKey: no key provided returns ok false with reason missing_key", async () => {
  const result = verifyApiKey(["some-key"], undefined);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_key");
});

test("verifyApiKey: empty configured keys returns ok false with reason misconfigured", async () => {
  const result = verifyApiKey([], "any-key");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "misconfigured");
});

test("verifyApiKey: matches any key in configured set", async () => {
  const result = verifyApiKey(["key-a", "key-b", "key-c"], "key-b");
  assert.equal(result.ok, true);
});
