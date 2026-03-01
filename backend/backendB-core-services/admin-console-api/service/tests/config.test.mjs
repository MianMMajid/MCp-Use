import assert from "node:assert/strict";
import test from "node:test";

// Set required env vars before import
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.MAPLE_ADMIN_ALLOW_NO_AUTH = process.env.MAPLE_ADMIN_ALLOW_NO_AUTH || "0";
process.env.ADMIN_CONSOLE_PORT = "9443";
process.env.ADMIN_CONSOLE_HOST = "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = "localhost:9400";
process.env.CONTEXT_WALL_ADDRESS = "localhost:9000";
process.env.MAPLE_ADMIN_TLS_CERT = "/etc/maple/admin-tls/tls.crt";
process.env.MAPLE_ADMIN_TLS_KEY = "/etc/maple/admin-tls/tls.key";
process.env.MAPLE_ADMIN_TLS_CA = "/etc/maple/admin-tls/ca.crt";

test("admin-console-api config requires all env vars", async () => {
  const { config } = await import(`../src/config.js?t=${Date.now()}`);
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
    process.env.NODE_ENV = previousNodeEnv;
    process.env.MAPLE_ADMIN_ALLOW_NO_AUTH = previousAllowNoAuth;
  }
});
