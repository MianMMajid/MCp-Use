import assert from "node:assert/strict";
import test from "node:test";

// Set required env vars before import
process.env.SECRETS_BROKER_PORT = "9300";
process.env.SECRETS_BROKER_HOST = "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = "localhost:9400";

test("secrets-broker config requires all env vars", async () => {
  const { config } = await import(`../src/config.js?t=${Date.now()}`);
  assert.equal(config.port, 9300);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(typeof config.auditWriterAddress, "string");
  assert.equal(config.defaultTtlSeconds > 0, true);
  assert.equal(config.maxTtlSeconds >= config.defaultTtlSeconds, true);
});

test("secrets-broker config throws when SECRETS_BROKER_PORT is missing", async () => {
  const saved = process.env.SECRETS_BROKER_PORT;
  delete process.env.SECRETS_BROKER_PORT;
  try {
    await assert.rejects(
      import(`../src/config.js?missing-port=${Date.now()}`),
      /Missing required environment variable: SECRETS_BROKER_PORT/
    );
  } finally {
    process.env.SECRETS_BROKER_PORT = saved;
  }
});
