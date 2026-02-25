import assert from "node:assert/strict";
import test from "node:test";

test("mcp-proxy config source includes runner/cyber endpoints", async () => {
  const { config } = await import("../src/config.js");
  assert.equal(config.port, 9200);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.toolRunnerAddress, "string");
  assert.equal(typeof config.cyberProxyAddress, "string");
  assert.equal(["service", "job"].includes(config.toolRunnerMode), true);
});
