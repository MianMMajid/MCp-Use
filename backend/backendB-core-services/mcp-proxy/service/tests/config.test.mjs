import assert from "node:assert/strict";
import test from "node:test";

// Set required env vars before import
process.env.MCP_PROXY_PORT = "9200";
process.env.MCP_PROXY_HOST = "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = "localhost:9400";
process.env.CONTEXT_WALL_ADDRESS = "localhost:9000";
process.env.SECRETS_BROKER_ADDRESS = "localhost:9300";
process.env.TOOL_RUNNER_ADDRESS = "localhost:9250";
process.env.CYBER_PROXY_ADDRESS = "localhost:8080";
process.env.DOWNSTREAM_APPS = "none";
process.env.MAPLE_DOWNSTREAM_APPS = "none";
process.env.MAPLE_TOOL_RUNNER_MODE = "service";
process.env.MAPLE_TOOL_RUNNER_IMAGE = "tool-runner:latest";
process.env.MAPLE_TOOL_RUNNER_JOB_NAMESPACE = "maple-tools";

test("mcp-proxy config requires all env vars", async () => {
  const { config } = await import(`../src/config.js?t=${Date.now()}`);
  assert.equal(config.port, 9200);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.toolRunnerAddress, "string");
  assert.equal(typeof config.cyberProxyAddress, "string");
  assert.equal(["service", "job"].includes(config.toolRunnerMode), true);
});

test("mcp-proxy config throws when MCP_PROXY_PORT is missing", async () => {
  const saved = process.env.MCP_PROXY_PORT;
  delete process.env.MCP_PROXY_PORT;
  try {
    await assert.rejects(
      import(`../src/config.js?missing-port=${Date.now()}`),
      /Missing required environment variable: MCP_PROXY_PORT/
    );
  } finally {
    process.env.MCP_PROXY_PORT = saved;
  }
});
