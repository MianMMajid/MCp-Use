import assert from "node:assert/strict";
import test from "node:test";

test("business-api config exposes service defaults", async () => {
  const module = await import(`../src/config.js?defaults=${Date.now()}`);
  assert.equal(module.serviceName, "business-api");
  assert.equal(typeof module.businessApiHost, "string");
  assert.equal(typeof module.businessApiPort, "number");
  assert.equal(module.businessApiPort > 0, true);
  assert.equal(typeof module.businessApiTlsCertPath, "string");
  assert.equal(typeof module.businessApiTlsKeyPath, "string");
  assert.equal(typeof module.businessApiTlsCaPath, "string");
  assert.equal(typeof module.billingEnabled, "boolean");
});

test("business-api config rejects MAPLE_ALLOW_NO_AUTH in production", async () => {
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
