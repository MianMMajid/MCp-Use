import assert from "node:assert/strict";
import test from "node:test";

// Set required env vars before import
process.env.AUDIT_WRITER_PORT = "9400";
process.env.AUDIT_WRITER_HTTP_PORT = "9401";
process.env.AUDIT_WRITER_HOST = "0.0.0.0";
process.env.DATABASE_URL = "postgresql://maple:maple@127.0.0.1:5432/maple_test";

test("audit-writer config requires all env vars", async () => {
  const { config } = await import(`../src/config.js?t=${Date.now()}`);
  assert.equal(config.port, 9400);
  assert.equal(config.httpPort, 9401);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.databaseUrl, "postgresql://maple:maple@127.0.0.1:5432/maple_test");
});

test("audit-writer config throws when AUDIT_WRITER_PORT is missing", async () => {
  const saved = process.env.AUDIT_WRITER_PORT;
  delete process.env.AUDIT_WRITER_PORT;
  try {
    await assert.rejects(
      import(`../src/config.js?missing-port=${Date.now()}`),
      /Missing required environment variable: AUDIT_WRITER_PORT/
    );
  } finally {
    process.env.AUDIT_WRITER_PORT = saved;
  }
});
