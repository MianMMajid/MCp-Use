import assert from "node:assert/strict";
import test from "node:test";

test("admin-console-api config source exposes tls/grpc defaults", async () => {
  const { config } = await import("../src/config.js");
  assert.equal(config.port, 9443);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.contextWallAddress, "string");
  assert.equal(typeof config.auditWriterAddress, "string");
  assert.equal(typeof config.tlsCertPath, "string");
  assert.equal(typeof config.tlsKeyPath, "string");
  assert.equal(typeof config.tlsCaPath, "string");
  assert.equal(Array.isArray(config.apiKeys), true);
  assert.equal(typeof config.allowNoAuth, "boolean");
});

test("admin-console-api config rejects MAPLE_ADMIN_ALLOW_NO_AUTH in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowNoAuth = process.env.MAPLE_ADMIN_ALLOW_NO_AUTH;
  process.env.NODE_ENV = "production";
  process.env.MAPLE_ADMIN_ALLOW_NO_AUTH = "1";

  try {
    await assert.rejects(
      import(`../src/config.js?prod-guard=${Date.now()}`),
      /MAPLE_ADMIN_ALLOW_NO_AUTH cannot be enabled in production runtime\./
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousAllowNoAuth === undefined) {
      delete process.env.MAPLE_ADMIN_ALLOW_NO_AUTH;
    } else {
      process.env.MAPLE_ADMIN_ALLOW_NO_AUTH = previousAllowNoAuth;
    }
  }
});
