import assert from "node:assert/strict";
import test from "node:test";

test("audit-writer config source exposes runtime defaults", async () => {
  const { config } = await import("../src/config.js");
  assert.equal(config.port, 9400);
  assert.equal(config.httpPort, 9401);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.databaseUrl, "string");
});
