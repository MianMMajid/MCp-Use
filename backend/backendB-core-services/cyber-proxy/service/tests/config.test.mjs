import assert from "node:assert/strict";
import test from "node:test";

test("cyber-proxy config source includes allow/block policy defaults", async () => {
  const { config } = await import("../src/config.js");
  assert.equal(config.port, 8080);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(Array.isArray(config.allowedDomains), true);
  assert.equal(Array.isArray(config.blockedDomains), true);
  assert.equal(typeof config.requestTimeoutMs, "number");
  assert.equal(typeof config.quarantineEnabled, "boolean");
});
