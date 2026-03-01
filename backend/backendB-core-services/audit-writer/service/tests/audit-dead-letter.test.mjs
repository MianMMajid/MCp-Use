import assert from "node:assert/strict";
import test from "node:test";

import { AuditStore } from "../src/store.js";

const DATABASE_URL = process.env.DATABASE_URL;
const skip = !DATABASE_URL;

test("AuditStore: dead-letter table is created on initialize", { skip }, async () => {
  const store = new AuditStore();
  await store.initialize(DATABASE_URL);
  try {
    const result = await store.pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'audit_dead_letter'"
    );
    assert.equal(result.rows.length, 1);
  } finally {
    await store.shutdown();
  }
});

test("AuditStore: listDeadLetter returns empty when no failures", { skip }, async () => {
  const store = new AuditStore();
  await store.initialize(DATABASE_URL);
  try {
    const result = await store.listDeadLetter(10, 0);
    assert.ok(Array.isArray(result.events));
    assert.equal(typeof result.totalCount, "number");
  } finally {
    await store.shutdown();
  }
});

test("AuditStore: insertDeadLetter and replayDeadLetter", { skip }, async () => {
  const store = new AuditStore();
  await store.initialize(DATABASE_URL);
  try {
    const event = {
      eventId: "dlq-test-" + Date.now(),
      eventType: "test_event",
      timestamp: new Date().toISOString(),
      sourceService: "test",
      summary: "dead letter test event",
    };

    // Insert into dead letter directly
    await store.insertDeadLetter(event, "simulated failure");

    // Verify it's in the dead-letter table
    const dlqList = await store.listDeadLetter(10, 0);
    const found = dlqList.events.find((e) => e.eventId === event.eventId);
    assert.ok(found, "Event should be in dead-letter queue");
    assert.equal(found.error, "simulated failure");

    // Replay the event
    const replayResult = await store.replayDeadLetter(event.eventId);
    assert.equal(replayResult.replayed, true);

    // Verify it's removed from dead-letter
    const afterReplay = await store.listDeadLetter(10, 0);
    const stillThere = afterReplay.events.find((e) => e.eventId === event.eventId);
    assert.equal(stillThere, undefined, "Event should be removed from dead-letter after replay");

    // Verify it's in audit_events
    const auditResult = await store.pool.query(
      "SELECT event_id FROM audit_events WHERE event_id = $1",
      [event.eventId]
    );
    assert.equal(auditResult.rows.length, 1);
  } finally {
    await store.shutdown();
  }
});

test("AuditStore: replayDeadLetter returns not_found for missing event", { skip }, async () => {
  const store = new AuditStore();
  await store.initialize(DATABASE_URL);
  try {
    const result = await store.replayDeadLetter("nonexistent-event-id");
    assert.equal(result.replayed, false);
    assert.equal(result.reason, "not_found");
  } finally {
    await store.shutdown();
  }
});
