import assert from "node:assert/strict";
import test from "node:test";

test("gateway-api config source loads defaults", async () => {
  const module = await import("../src/config.js");
  assert.equal(typeof module.gatewayPort, "number");
  assert.equal(module.gatewayPort > 0, true);
  assert.equal(typeof module.gatewayHost, "string");
  assert.equal(typeof module.contextWallAddress, "string");
  assert.equal(typeof module.mcpProxyAddress, "string");
});
