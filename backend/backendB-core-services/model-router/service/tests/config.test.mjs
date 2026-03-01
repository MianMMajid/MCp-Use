import assert from "node:assert/strict";
import test from "node:test";

// Set required env vars before import
process.env.MODEL_ROUTER_PORT = "9100";
process.env.MODEL_ROUTER_HOST = "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = "localhost:9400";
process.env.DEFAULT_MODEL = "gpt-4o";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.MAPLE_FIREWALL_CHAT_PRIMARY = "openai";
process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL = "gpt-4o-mini";
process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS = "15000";

test("model-router config requires all env vars", async () => {
  const { config } = await import(`../src/config.js?t=${Date.now()}`);
  assert.equal(config.port, 9100);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.auditWriterAddress, "string");
  assert.equal(typeof config.primaryProvider, "string");
  assert.equal(typeof config.openaiModel, "string");
  assert.equal(typeof config.anthropicModel, "string");
});

test("model-router config throws when MODEL_ROUTER_PORT is missing", async () => {
  const saved = process.env.MODEL_ROUTER_PORT;
  delete process.env.MODEL_ROUTER_PORT;
  try {
    await assert.rejects(
      import(`../src/config.js?missing-port=${Date.now()}`),
      /Missing required environment variable: MODEL_ROUTER_PORT/
    );
  } finally {
    process.env.MODEL_ROUTER_PORT = saved;
  }
});
