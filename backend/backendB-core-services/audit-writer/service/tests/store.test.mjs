// Env setup before imports — required by @maple/common
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";

import assert from "node:assert/strict";
import test from "node:test";

const { AuditStore } = await import("../src/store.js");

const DATABASE_URL = process.env.DATABASE_URL;
const skip = !DATABASE_URL;

// ── In-memory / no-PG Tests ─────────────────────────────────────────────────

test("AuditStore: in-memory getAll returns empty initially", () => {
  const store = new AuditStore();
  assert.deepEqual(store.getAll(), []);
});

test("AuditStore: append throws when PG not ready", async () => {
  const store = new AuditStore();
  await assert.rejects(
    () => store.append({ eventId: "e1", eventType: "test" }),
    /not ready/
  );
});

test("AuditStore: query throws when PG not ready", async () => {
  const store = new AuditStore();
  await assert.rejects(
    () => store.query({}),
    /not ready/
  );
});

test("AuditStore: shutdown is safe when not initialized", async () => {
  const store = new AuditStore();
  await store.shutdown(); // should not throw
  assert.equal(store.pool, null);
  assert.equal(store.pgReady, false);
});

test("AuditStore: maxInMemory default is 10000", () => {
  const store = new AuditStore();
  assert.equal(store.maxInMemory, 10000);
});

test("AuditStore: pgReady is false before initialize", () => {
  const store = new AuditStore();
  assert.equal(store.pgReady, false);
  assert.equal(store.pool, null);
});

// ── Write Buffer Tests ──────────────────────────────────────────────────────

test("AuditStore: bufferEvent triggers flush at maxBufferSize", async () => {
  const store = new AuditStore();
  store.pgReady = true;
  store.pool = {};
  const insertedBatches = [];
  store.insertEventsPgBatch = async (events) => { insertedBatches.push(events); };
  store.insertEventPg = async () => {};
  store.insertDeadLetter = async () => {};

  store.maxBufferSize = 5;
  for (let i = 0; i < 5; i++) {
    store.bufferEvent({ eventId: `buf-${i}`, eventType: "test", timestamp: new Date().toISOString(), sourceService: "test" });
  }
  // Wait for async flush
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(insertedBatches.length > 0);
  assert.equal(insertedBatches[0].length, 5);

  if (store.flushTimer) clearTimeout(store.flushTimer);
});

test("AuditStore: flushBuffer is safe when buffer is empty", async () => {
  const store = new AuditStore();
  store.pgReady = true;
  store.pool = {};
  store.insertEventsPgBatch = async () => { throw new Error("should not be called"); };
  await store.flushBuffer(); // should not throw
});

test("AuditStore: query flushes pending buffered events before reading", async () => {
  const store = new AuditStore();
  store.pgReady = true;
  store.pool = {};
  let flushed = false;
  store.flushBuffer = async () => {
    flushed = true;
    store.writeBuffer = [];
  };
  store.queryPg = async () => ({ events: [{ eventId: "q-1" }], nextCursor: "", totalCount: 1 });

  store.writeBuffer.push({
    eventId: "q-1",
    eventType: "test",
    timestamp: new Date().toISOString(),
    sourceService: "test",
  });

  const result = await store.query({ traceId: "trace-q-1" });
  assert.equal(flushed, true);
  assert.equal(result.totalCount, 1);
  assert.equal(result.events[0].eventId, "q-1");
});

test("AuditStore: shutdown flushes remaining buffered events", async () => {
  const store = new AuditStore();
  store.pgReady = true;
  store.pool = { end: async () => {} };
  const flushed = [];
  store.insertEventsPgBatch = async (events) => { flushed.push(...events); };
  store.insertEventPg = async () => {};
  store.insertDeadLetter = async () => {};

  store.writeBuffer.push(
    { eventId: "sd-1", eventType: "test", timestamp: new Date().toISOString(), sourceService: "test" },
    { eventId: "sd-2", eventType: "test", timestamp: new Date().toISOString(), sourceService: "test" },
  );
  await store.shutdown();
  assert.equal(flushed.length, 2);
});

test("AuditStore: write buffer properties have correct defaults", () => {
  const store = new AuditStore();
  assert.deepEqual(store.writeBuffer, []);
  assert.equal(store.flushTimer, null);
  assert.equal(store.flushInProgress, false);
  assert.equal(store.maxBufferSize, 100);
  assert.equal(store.flushIntervalMs, 200);
});

test("AuditStore: concurrent flush protection — flushInProgress blocks reentry", async () => {
  const store = new AuditStore();
  store.pgReady = true;
  store.pool = {};
  let flushCount = 0;
  store.insertEventsPgBatch = async (events) => {
    flushCount++;
    await new Promise((r) => setTimeout(r, 50)); // simulate slow insert
  };
  store.insertEventPg = async () => {};
  store.insertDeadLetter = async () => {};

  store.writeBuffer.push(
    { eventId: "cf-1", eventType: "test", timestamp: new Date().toISOString(), sourceService: "test" },
  );
  // Start first flush (sets flushInProgress=true)
  const flush1 = store.flushBuffer();
  // Attempt second flush while first is in progress — should return immediately
  await store.flushBuffer();
  await flush1;
  assert.equal(flushCount, 1);
});

test("AuditStore: flushBuffer falls back to individual inserts on batch failure", async () => {
  const store = new AuditStore();
  store.pgReady = true;
  store.pool = {};
  const individualInserts = [];
  store.insertEventsPgBatch = async () => { throw new Error("batch fail"); };
  store.insertEventPg = async (event) => { individualInserts.push(event.eventId); };
  store.insertDeadLetter = async () => {};

  store.writeBuffer.push(
    { eventId: "fb-1", eventType: "test", timestamp: new Date().toISOString(), sourceService: "test" },
    { eventId: "fb-2", eventType: "test", timestamp: new Date().toISOString(), sourceService: "test" },
  );
  await store.flushBuffer();
  assert.deepEqual(individualInserts, ["fb-1", "fb-2"]);
});

// ── PG Tests (conditional on DATABASE_URL) ───────────────────────────────────

test("AuditStore: initialize creates tables", { skip }, async () => {
  const store = new AuditStore();
  await store.initialize(DATABASE_URL);
  try {
    assert.equal(store.pgReady, true);
    assert.ok(store.pool);
  } finally {
    await store.shutdown();
  }
});

test("AuditStore: append and query round-trip", { skip }, async () => {
  const store = new AuditStore();
  await store.initialize(DATABASE_URL);
  try {
    const eventId = await store.append({
      eventId: `test-${Date.now()}`,
      eventType: "test_event",
      timestamp: new Date().toISOString(),
      sourceService: "test",
      traceId: "trace-store-test",
      summary: "store test event",
    });
    assert.ok(eventId);

    const result = await store.query({ traceId: "trace-store-test" });
    assert.ok(result.events.length > 0);

    const all = store.getAll();
    assert.ok(all.length > 0);
  } finally {
    await store.shutdown();
  }
});

test("AuditStore: appendBatch returns event IDs", { skip }, async () => {
  const store = new AuditStore();
  await store.initialize(DATABASE_URL);
  try {
    const events = [
      { eventId: `batch-1-${Date.now()}`, eventType: "batch_test", timestamp: new Date().toISOString(), sourceService: "test" },
      { eventId: `batch-2-${Date.now()}`, eventType: "batch_test", timestamp: new Date().toISOString(), sourceService: "test" },
    ];
    const ids = await store.appendBatch(events);
    assert.equal(ids.length, 2);
  } finally {
    await store.shutdown();
  }
});

test("AuditStore: query with pagination cursor", { skip }, async () => {
  const store = new AuditStore();
  await store.initialize(DATABASE_URL);
  try {
    const result = await store.query({ limit: 5 });
    assert.ok(Array.isArray(result.events));
    assert.equal(typeof result.nextCursor, "string");
    assert.equal(typeof result.totalCount, "number");
  } finally {
    await store.shutdown();
  }
});

test("AuditStore: shutdown sets pgReady to false", { skip }, async () => {
  const store = new AuditStore();
  await store.initialize(DATABASE_URL);
  assert.equal(store.pgReady, true);
  await store.shutdown();
  assert.equal(store.pgReady, false);
  assert.equal(store.pool, null);
});
