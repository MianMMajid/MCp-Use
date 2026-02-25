import assert from "node:assert/strict";
import test from "node:test";

import { createAuditWriterService } from "../src/service.js";

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
