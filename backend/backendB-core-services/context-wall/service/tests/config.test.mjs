import assert from "node:assert/strict";
import test from "node:test";

// Set required env vars before import
process.env.CONTEXT_WALL_PORT = "9000";
process.env.CONTEXT_WALL_HOST = "0.0.0.0";
process.env.CONTEXT_WALL_HITL_TIMEOUT_MS = "120000";
process.env.AUDIT_WRITER_ADDRESS = "localhost:9400";
process.env.MODEL_ROUTER_ADDRESS = "localhost:9100";
process.env.MCP_PROXY_ADDRESS = "localhost:9200";

test("context-wall config requires all env vars", async () => {
  const { config } = await import(`../src/config.js?t=${Date.now()}`);
  assert.equal(config.port, 9000);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.auditWriterAddress, "string");
  assert.equal(typeof config.modelRouterAddress, "string");
  assert.equal(typeof config.mcpProxyAddress, "string");
  assert.equal(config.hitlApprovalTimeoutMs >= 1000, true);
});

test("context-wall config throws when CONTEXT_WALL_PORT is missing", async () => {
  const saved = process.env.CONTEXT_WALL_PORT;
  delete process.env.CONTEXT_WALL_PORT;
  try {
    await assert.rejects(
      import(`../src/config.js?missing-port=${Date.now()}`),
      /Missing required environment variable: CONTEXT_WALL_PORT/
    );
  } finally {
    process.env.CONTEXT_WALL_PORT = saved;
  }
});
