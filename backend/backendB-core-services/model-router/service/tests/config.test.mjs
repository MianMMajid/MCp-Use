import assert from "node:assert/strict";
import test from "node:test";

test("model-router config source exposes provider defaults", async () => {
  const { config } = await import("../src/config.js");
  assert.equal(config.port, 9100);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.auditWriterAddress, "string");
  assert.equal(typeof config.primaryProvider, "string");
  assert.equal(typeof config.openaiModel, "string");
  assert.equal(typeof config.anthropicModel, "string");
});
