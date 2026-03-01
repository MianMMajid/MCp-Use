// Set required env vars before import (audit-writer config.js uses requireEnv)
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.AUDIT_WRITER_PORT = process.env.AUDIT_WRITER_PORT || "9400";
process.env.AUDIT_WRITER_HTTP_PORT = process.env.AUDIT_WRITER_HTTP_PORT || "9401";
process.env.AUDIT_WRITER_HOST = process.env.AUDIT_WRITER_HOST || "0.0.0.0";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://maple:maple@127.0.0.1:5432/maple_test";

import assert from "node:assert/strict";
import test from "node:test";

// Use dynamic import so env vars are set before config.js is evaluated
const { createAuditWriterService } = await import("../src/service.js");

function createStubStore() {
  return {
    append() {
      return "evt-1";
    },
    appendBatch(events) {
      return Array.isArray(events) ? events.map((_event, idx) => `evt-${idx + 1}`) : [];
    },
    async query() {
      return { events: [], nextCursor: "", totalCount: 0 };
    },
  };
}

test("audit-writer service factory returns a grpc server instance", () => {
  const server = createAuditWriterService(createStubStore());

  assert.equal(typeof server.addService, "function");
  assert.equal(typeof server.bindAsync, "function");
  assert.equal(typeof server.forceShutdown, "function");

  server.forceShutdown();
});
