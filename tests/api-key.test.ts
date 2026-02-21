import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractApiKeyFromHeaders,
  loadApiKeysFromEnv,
  verifyApiKey,
} from "../src/security/api-key.ts";

test("loadApiKeysFromEnv loads and deduplicates keys", () => {
  const keys = loadApiKeysFromEnv({
    MAPLE_API_KEY: " alpha ",
    MAPLE_API_KEYS: "beta,alpha,gamma",
  } as NodeJS.ProcessEnv);

  assert.deepEqual(keys.sort(), ["alpha", "beta", "gamma"]);
});

test("loadApiKeysFromEnv strips optional surrounding quotes", () => {
  const keys = loadApiKeysFromEnv({
    MAPLE_API_KEY: "\"alpha\"",
    MAPLE_API_KEYS: "'beta',\"gamma\"",
  } as NodeJS.ProcessEnv);

  assert.deepEqual(keys.sort(), ["alpha", "beta", "gamma"]);
});

test("extractApiKeyFromHeaders prefers x-api-key over bearer", () => {
  const key = extractApiKeyFromHeaders("x-key", "Bearer bearer-key");
  assert.equal(key, "x-key");
});

test("extractApiKeyFromHeaders strips optional quotes", () => {
  const xApiKey = extractApiKeyFromHeaders("'x-key'", undefined);
  assert.equal(xApiKey, "x-key");

  const bearer = extractApiKeyFromHeaders(undefined, 'Bearer "bearer-key"');
  assert.equal(bearer, "bearer-key");
});

test("verifyApiKey validates configured keys", () => {
  const ok = verifyApiKey(["secret-key"], "secret-key");
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(typeof ok.keyFingerprint, "string");
    assert.equal(ok.keyFingerprint?.length, 12);
  }

  const missing = verifyApiKey(["secret-key"], undefined);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "missing_key");

  const invalid = verifyApiKey(["secret-key"], "wrong");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, "invalid_key");
});
