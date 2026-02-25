import assert from "node:assert/strict";
import test from "node:test";

test("tool-runner config source includes cyber/audit wiring defaults", async () => {
  const { config } = await import("../src/config.js");
  assert.equal(config.port, 9250);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.cyberProxyAddress, "string");
  assert.equal(typeof config.auditWriterAddress, "string");
});
