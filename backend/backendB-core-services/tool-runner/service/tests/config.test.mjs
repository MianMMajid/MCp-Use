import assert from "node:assert/strict";
import test from "node:test";

// Set required env vars before import
process.env.TOOL_RUNNER_PORT = "9250";
process.env.TOOL_RUNNER_HOST = "0.0.0.0";
process.env.CYBER_PROXY_ADDRESS = "localhost:8080";
process.env.AUDIT_WRITER_ADDRESS = "localhost:9400";

test("tool-runner config requires all env vars", async () => {
  const { config } = await import(`../src/config.js?t=${Date.now()}`);
  assert.equal(config.port, 9250);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.cyberProxyAddress, "string");
  assert.equal(typeof config.auditWriterAddress, "string");
});

test("tool-runner config throws when TOOL_RUNNER_PORT is missing", async () => {
  const saved = process.env.TOOL_RUNNER_PORT;
  delete process.env.TOOL_RUNNER_PORT;
  try {
    await assert.rejects(
      import(`../src/config.js?missing-port=${Date.now()}`),
      /Missing required environment variable: TOOL_RUNNER_PORT/
    );
  } finally {
    process.env.TOOL_RUNNER_PORT = saved;
  }
});
