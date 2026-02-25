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
});
