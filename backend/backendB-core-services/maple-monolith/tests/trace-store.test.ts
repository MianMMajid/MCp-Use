import assert from "node:assert/strict";
import { test } from "node:test";
import { TraceStore } from "../src/core/trace-store.js";
import type { Trace } from "../src/core/types.js";

function createBaseTrace(sessionId: string): Omit<Trace, "id" | "startedAt" | "updatedAt"> {
  return {
    sessionId,
    source: "manual",
    status: "active",
    metadata: {},
    steps: [],
  };
}

test("TraceStore enforces owner isolation", () => {
  const store = new TraceStore({ maxTraces: 50, maxTracesPerSession: 50, ttlMs: 60_000 });
  const trace = store.createTrace(createBaseTrace("s1"), "owner-a");

  assert.ok(store.getTrace(trace.id, "owner-a"));
  assert.equal(store.getTrace(trace.id, "owner-b"), undefined);

  const visibleToA = store.listTraces(10, undefined, "owner-a");
  const visibleToB = store.listTraces(10, undefined, "owner-b");
  assert.equal(visibleToA.length, 1);
  assert.equal(visibleToB.length, 0);
});

test("TraceStore rejects ownership reassignment", () => {
  const store = new TraceStore({ maxTraces: 50, maxTracesPerSession: 50, ttlMs: 60_000 });
  const trace = store.createTrace(createBaseTrace("s1"), "owner-a");

  assert.throws(() => {
    store.upsertTrace(trace, "owner-b");
  }, /ownership mismatch/i);
});

test("TraceStore prunes oldest traces when maxTraces exceeded", () => {
  const store = new TraceStore({ maxTraces: 2, maxTracesPerSession: 5, ttlMs: 60_000 });
  const first = store.createTrace(createBaseTrace("s1"), "owner-a");
  const second = store.createTrace(createBaseTrace("s2"), "owner-a");
  store.createTrace(createBaseTrace("s3"), "owner-a");

  assert.equal(store.getTrace(first.id, "owner-a"), undefined);
  assert.ok(store.getTrace(second.id, "owner-a"));
  assert.equal(store.listTraces(10, undefined, "owner-a").length, 2);
});

test("TraceStore prunes expired traces by TTL", async () => {
  const store = new TraceStore({ maxTraces: 10, maxTracesPerSession: 10, ttlMs: 1 });
  const trace = store.createTrace(createBaseTrace("s1"), "owner-a");
  await new Promise((resolve) => setTimeout(resolve, 5));

  store.createTrace(createBaseTrace("s2"), "owner-a");
  assert.equal(store.getTrace(trace.id, "owner-a"), undefined);
});
