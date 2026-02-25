import assert from "node:assert/strict";
import test from "node:test";

import { ApprovalQueue } from "../src/approval-queue.js";

test("approval queue notifies watchers and lists pending approvals", () => {
  const queue = new ApprovalQueue();
  queue.enqueue("trace-1", 3, { type: "tool_call" });

  const seen = [];
  const stop = queue.watch((approval) => {
    seen.push(approval);
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].traceId, "trace-1");
  assert.equal(seen[0].stepIndex, 3);

  const pending = queue.getPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].traceId, "trace-1");

  stop();
});

test("approval queue resolves active waiter and clears pending entry", async () => {
  const queue = new ApprovalQueue();
  queue.enqueue("trace-2", 4, { type: "tool_call", name: "web_search" });

  const resolution = queue.waitForResolution("trace-2", 4, 2000);
  setTimeout(() => {
    queue.resolve("trace-2", 4, "allow", "approved", "admin-1");
  }, 10);

  const result = await resolution;
  assert.equal(result?.action, "allow");
  assert.equal(result?.reason, "approved");
  assert.equal(result?.approverId, "admin-1");
  assert.equal(queue.getPending().length, 0);
});

test("approval queue returns cached resolution when resolved before waiting", async () => {
  const queue = new ApprovalQueue();
  queue.enqueue("trace-3", 5, { type: "tool_call", name: "weather_forecast" });

  const resolved = queue.resolve("trace-3", 5, "block", "unsafe domain", "admin-2");
  assert.equal(resolved?.action, "block");

  const waited = await queue.waitForResolution("trace-3", 5, 1000);
  assert.equal(waited?.action, "block");
  assert.equal(waited?.reason, "unsafe domain");

  const consumed = await queue.waitForResolution("trace-3", 5, 1000);
  assert.equal(consumed, null);
});
