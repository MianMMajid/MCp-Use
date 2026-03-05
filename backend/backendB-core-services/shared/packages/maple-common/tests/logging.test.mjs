import test from "node:test";
import assert from "node:assert/strict";

process.env.MAPLE_LOG_LEVEL = "debug";
process.env.MAPLE_LOG_INCLUDE_BODIES = "true";
process.env.MAPLE_LOG_REQUESTS = "true";
process.env.MAPLE_LOG_BODY_MAX_CHARS = "4000";

const { shouldLogLevel, redactForLogs, mapleLog } = await import(
  "../src/logging.js?t=" + Date.now()
);

// ---------------------------------------------------------------------------
// shouldLogLevel
// ---------------------------------------------------------------------------

test("shouldLogLevel: error visible at debug level", () => {
  assert.equal(shouldLogLevel("error"), true);
});

test("shouldLogLevel: trace not visible at debug level", () => {
  assert.equal(shouldLogLevel("trace"), false);
});

test("shouldLogLevel: debug visible at debug level", () => {
  assert.equal(shouldLogLevel("debug"), true);
});

// ---------------------------------------------------------------------------
// redactForLogs — sensitive keys
// ---------------------------------------------------------------------------

test("redactForLogs: redacts password", () => {
  assert.deepEqual(redactForLogs({ password: "secret123" }), { password: "[redacted]" });
});

test("redactForLogs: redacts token", () => {
  assert.deepEqual(redactForLogs({ token: "abc" }), { token: "[redacted]" });
});

test("redactForLogs: redacts api_key", () => {
  assert.deepEqual(redactForLogs({ api_key: "k" }), { api_key: "[redacted]" });
});

test("redactForLogs: redacts authorization", () => {
  assert.deepEqual(redactForLogs({ authorization: "Bearer x" }), {
    authorization: "[redacted]",
  });
});

test("redactForLogs: redacts cookie", () => {
  assert.deepEqual(redactForLogs({ cookie: "sess=x" }), { cookie: "[redacted]" });
});

test("redactForLogs: preserves safe keys", () => {
  assert.deepEqual(redactForLogs({ safe: "value" }), { safe: "value" });
});

// ---------------------------------------------------------------------------
// redactForLogs — recursion depth
// ---------------------------------------------------------------------------

test("redactForLogs: truncates at depth 6+", () => {
  // depth 0 → 1 → 2 → 3 → 4 → 5 → 6 should hit > 5 guard
  const deep = { a: { b: { c: { d: { e: { f: { g: "deep" } } } } } } };
  const result = redactForLogs(deep);
  assert.equal(result.a.b.c.d.e.f, "[truncated-depth]");
});

// ---------------------------------------------------------------------------
// redactForLogs — array truncation
// ---------------------------------------------------------------------------

test("redactForLogs: truncates arrays longer than 100", () => {
  const bigArray = Array.from({ length: 150 }, (_, i) => i);
  const result = redactForLogs(bigArray);
  assert.equal(result.length, 101); // 100 items + truncation message
  assert.ok(typeof result[100] === "string");
  assert.ok(result[100].includes("truncated"));
});

// ---------------------------------------------------------------------------
// mapleLog
// ---------------------------------------------------------------------------

test("mapleLog: does not throw", () => {
  assert.doesNotThrow(() => {
    mapleLog("info", "test-event", { detail: "value" });
  });
});
