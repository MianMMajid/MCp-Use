// Env setup before imports — required by @maple/common and config.js
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.AUDIT_WRITER_PORT = process.env.AUDIT_WRITER_PORT || "9400";
process.env.AUDIT_WRITER_HTTP_PORT = process.env.AUDIT_WRITER_HTTP_PORT || "9401";
process.env.AUDIT_WRITER_HOST = process.env.AUDIT_WRITER_HOST || "0.0.0.0";
process.env.NODE_ENV = "development";

import assert from "node:assert/strict";
import test from "node:test";

const { createAuditWriterService } = await import(`../src/service.js?t=${Date.now()}`);

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockStore() {
  const events = [];
  const appendCalls = [];
  const batchCalls = [];
  const queryCalls = [];
  return {
    events,
    appendCalls,
    batchCalls,
    queryCalls,
    async append(event) {
      appendCalls.push(event);
      events.push(event);
      return event.eventId || "generated-id";
    },
    async appendBatch(batch) {
      batchCalls.push(batch);
      events.push(...batch);
      return batch.map((e, i) => e.eventId || `batch-${i}`);
    },
    async query(filters) {
      queryCalls.push(filters);
      return {
        events: events.filter(e => !filters.traceId || e.traceId === filters.traceId),
        nextCursor: "",
        totalCount: events.length,
      };
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("createAuditWriterService: returns gRPC server with correct interface", () => {
  const store = createMockStore();
  const server = createAuditWriterService(store);
  assert.ok(server);
  assert.equal(typeof server.addService, "function");
  assert.equal(typeof server.bindAsync, "function");
  assert.equal(typeof server.forceShutdown, "function");
  server.forceShutdown();
});

test("createAuditWriterService: accepts different store implementations", () => {
  const minimalStore = {
    async append() { return "id"; },
    async appendBatch() { return []; },
    async query() { return { events: [], nextCursor: "", totalCount: 0 }; },
  };
  const server = createAuditWriterService(minimalStore);
  assert.ok(server);
  server.forceShutdown();
});

test("createAuditWriterService: multiple servers can be created independently", () => {
  const store1 = createMockStore();
  const store2 = createMockStore();

  const server1 = createAuditWriterService(store1);
  const server2 = createAuditWriterService(store2);

  assert.ok(server1);
  assert.ok(server2);
  assert.notEqual(server1, server2);

  server1.forceShutdown();
  server2.forceShutdown();
});

test("mock store: append tracks calls and returns eventId", async () => {
  const store = createMockStore();
  const id = await store.append({ eventId: "evt-1", eventType: "test", sourceService: "unit" });
  assert.equal(id, "evt-1");
  assert.equal(store.appendCalls.length, 1);
  assert.equal(store.events.length, 1);
});

test("mock store: appendBatch tracks calls and returns all IDs", async () => {
  const store = createMockStore();
  const events = [
    { eventId: "b-1", eventType: "batch_test", sourceService: "unit" },
    { eventId: "b-2", eventType: "batch_test", sourceService: "unit" },
  ];
  const ids = await store.appendBatch(events);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], "b-1");
  assert.equal(ids[1], "b-2");
  assert.equal(store.batchCalls.length, 1);
  assert.equal(store.events.length, 2);
});

test("mock store: query filters by traceId", async () => {
  const store = createMockStore();
  await store.append({ eventId: "q-1", traceId: "trace-A", eventType: "test" });
  await store.append({ eventId: "q-2", traceId: "trace-B", eventType: "test" });

  const result = await store.query({ traceId: "trace-A" });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].eventId, "q-1");
});
