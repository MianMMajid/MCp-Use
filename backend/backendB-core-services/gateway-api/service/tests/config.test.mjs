import assert from "node:assert/strict";
import test from "node:test";

test("gateway-api config source loads defaults", async () => {
  const module = await import("../src/config.js");
  assert.equal(typeof module.gatewayPort, "number");
  assert.equal(module.gatewayPort > 0, true);
  assert.equal(typeof module.gatewayHost, "string");
  assert.equal(typeof module.contextWallAddress, "string");
  assert.equal(typeof module.mcpProxyAddress, "string");
  assert.equal(typeof module.toolRunnerAddress, "string");
  assert.equal(typeof module.cyberProxyAddress, "string");
});

test("gateway-api config rejects MAPLE_ALLOW_NO_AUTH in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowNoAuth = process.env.MAPLE_ALLOW_NO_AUTH;
  process.env.NODE_ENV = "production";
  process.env.MAPLE_ALLOW_NO_AUTH = "1";

  try {
    await assert.rejects(
      import(`../src/config.js?prod-guard=${Date.now()}`),
      /MAPLE_ALLOW_NO_AUTH cannot be enabled in production runtime\./
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousAllowNoAuth === undefined) {
      delete process.env.MAPLE_ALLOW_NO_AUTH;
    } else {
      process.env.MAPLE_ALLOW_NO_AUTH = previousAllowNoAuth;
    }
  }
});
