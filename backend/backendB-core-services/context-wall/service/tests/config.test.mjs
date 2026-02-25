import assert from "node:assert/strict";
import test from "node:test";

test("context-wall config source exposes grpc defaults", async () => {
  const { config } = await import("../src/config.js");
  assert.equal(config.port, 9000);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.auditWriterAddress, "string");
  assert.equal(typeof config.modelRouterAddress, "string");
  assert.equal(typeof config.mcpProxyAddress, "string");
  assert.equal(config.hitlApprovalTimeoutMs >= 1000, true);
});
