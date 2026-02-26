import assert from "node:assert/strict";
import test from "node:test";

test("secrets-broker config source exposes grpc defaults", async () => {
  const { config } = await import("../src/config.js");
  assert.equal(config.port, 9300);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.auditWriterAddress, "string");
  assert.equal(config.defaultTtlSeconds > 0, true);
  assert.equal(config.maxTtlSeconds >= config.defaultTtlSeconds, true);
});
