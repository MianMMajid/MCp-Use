// Env setup before imports — required by @maple/common
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";

import assert from "node:assert/strict";
import test from "node:test";

const { PolicyStorePg } = await import("../src/policy-store-pg.js");

const DATABASE_URL = process.env.DATABASE_URL;
const skip = !DATABASE_URL;

// ── Tests (PG-conditional) ───────────────────────────────────────────────────

test("PolicyStorePg: initialize creates policy table", { skip }, async () => {
  const store = new PolicyStorePg();
  await store.initialize(DATABASE_URL);
  try {
    const result = await store.pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'context_wall_policies'"
    );
    assert.equal(result.rows.length, 1);
  } finally {
    await store.destroy();
  }
});

test("PolicyStorePg: savePolicy inserts with version tracking", { skip }, async () => {
  const store = new PolicyStorePg();
  await store.initialize(DATABASE_URL);
  try {
    const rules = [{ name: "test-rule", action: "deny", severity: "high" }];
    const result = await store.savePolicy(rules, "test-user");
    assert.ok(result.version >= 1);
    assert.ok(result.createdAt);
  } finally {
    await store.destroy();
  }
});

test("PolicyStorePg: loadPolicy returns latest version", { skip }, async () => {
  const store = new PolicyStorePg();
  await store.initialize(DATABASE_URL);
  try {
    const rules = [{ name: "latest-rule", action: "allow", severity: "low" }];
    await store.savePolicy(rules, "test");
    const loaded = await store.loadPolicy();
    assert.ok(loaded);
    assert.ok(Array.isArray(loaded.rules));
    assert.ok(loaded.version >= 1);
  } finally {
    await store.destroy();
  }
});

test("PolicyStorePg: destroy closes pool", { skip }, async () => {
  const store = new PolicyStorePg();
  await store.initialize(DATABASE_URL);
  await store.destroy();
  assert.equal(store.pool, null);
  assert.equal(store.pgReady, false);
});

test("PolicyStorePg: loadPolicy returns null before initialize", async () => {
  const store = new PolicyStorePg();
  const result = await store.loadPolicy();
  assert.equal(result, null);
});
