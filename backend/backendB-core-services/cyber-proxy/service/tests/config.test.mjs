import assert from "node:assert/strict";
import test from "node:test";

// Set required env vars before import
process.env.CYBER_PROXY_PORT = "8080";
process.env.CYBER_PROXY_HOST = "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = "localhost:9400";
process.env.CYBER_ALLOWED_DOMAINS = "example.com";
process.env.CYBER_BLOCKED_DOMAINS = "evil.com";
process.env.CYBER_TOOL_ALLOWED_DOMAINS_JSON = "{}";
process.env.CYBER_MAX_RESPONSE_BYTES = "10485760";
process.env.CYBER_QUARANTINE_ENABLED = "1";

test("cyber-proxy config requires all env vars", async () => {
  const { config } = await import(`../src/config.js?t=${Date.now()}`);
  assert.equal(config.port, 8080);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(Array.isArray(config.allowedDomains), true);
  assert.equal(Array.isArray(config.blockedDomains), true);
  assert.equal(typeof config.requestTimeoutMs, "number");
  assert.equal(typeof config.quarantineEnabled, "boolean");
});

test("cyber-proxy config throws when CYBER_PROXY_PORT is missing", async () => {
  const saved = process.env.CYBER_PROXY_PORT;
  delete process.env.CYBER_PROXY_PORT;
  try {
    await assert.rejects(
      import(`../src/config.js?missing-port=${Date.now()}`),
      /Missing required environment variable: CYBER_PROXY_PORT/
    );
  } finally {
    process.env.CYBER_PROXY_PORT = saved;
  }
});
