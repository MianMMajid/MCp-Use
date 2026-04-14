import assert from "node:assert/strict";
import test from "node:test";

import { ApprovalQueue } from "../src/approval-queue.js";

function createSharedApprovalPool() {
  const approvals = new Map();

  return {
    approvals,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();

      if (normalized.startsWith("CREATE TABLE IF NOT EXISTS context_wall_approvals")) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes("INSERT INTO context_wall_approvals")) {
        const [approvalId, traceId, stepIndex, requestedAt, expiresAt, stepJson] = params;
        approvals.set(`${traceId}:${stepIndex}`, {
          approval_id: approvalId,
          trace_id: traceId,
          step_index: Number(stepIndex),
          status: "pending",
          requested_at: requestedAt,
          resolved_at: null,
          expires_at: expiresAt,
          action: "",
          reason: "",
          approver_id: "",
          step_json: stepJson,
        });
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes("SET status = 'resolved'")) {
        const [traceId, stepIndex, resolvedAt, action, reason, approverId] = params;
        const key = `${traceId}:${stepIndex}`;
        const record = approvals.get(key);
        if (!record || record.status !== "pending") {
          return { rows: [], rowCount: 0 };
        }
        record.status = "resolved";
        record.resolved_at = resolvedAt;
        record.action = action;
        record.reason = reason;
        record.approver_id = approverId;
        approvals.set(key, record);
        return { rows: [{ approval_id: record.approval_id }], rowCount: 1 };
      }

      if (normalized.includes("SET status = 'timed_out'")) {
        const [traceId, stepIndex, resolvedAt] = params;
        const key = `${traceId}:${stepIndex}`;
        const record = approvals.get(key);
        if (!record || record.status !== "pending") {
          return { rows: [], rowCount: 0 };
        }
        record.status = "timed_out";
        record.resolved_at = resolvedAt;
        approvals.set(key, record);
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes("SELECT approval_id, trace_id, step_index, status")) {
        const [traceId, stepIndex] = params;
        const record = approvals.get(`${traceId}:${stepIndex}`);
        return { rows: record ? [{ ...record }] : [], rowCount: record ? 1 : 0 };
      }

      if (normalized.includes("SELECT approval_id FROM context_wall_approvals")) {
        const [traceId, stepIndex] = params;
        const record = approvals.get(`${traceId}:${stepIndex}`);
        return {
          rows: record && record.status === "pending" ? [{ approval_id: record.approval_id }] : [],
          rowCount: record && record.status === "pending" ? 1 : 0,
        };
      }

      if (normalized.includes("SELECT trace_id, step_index, step_json, requested_at, expires_at")) {
        const rows = [...approvals.values()]
          .filter((record) => record.status === "pending")
          .sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)));
        return { rows, rowCount: rows.length };
      }

      throw new Error(`Unhandled fake approval pool query: ${normalized}`);
    },
  };
}

test("approval queue notifies watchers and lists pending approvals", async () => {
  const queue = new ApprovalQueue();
  await queue.enqueue("trace-1", 3, { type: "tool_call" });

  const seen = [];
  const stop = queue.watch((approval) => {
    seen.push(approval);
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(seen.length, 1);
  assert.equal(seen[0].traceId, "trace-1");
  assert.equal(seen[0].stepIndex, 3);

  const pending = await queue.getPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].traceId, "trace-1");

  stop();
});

test("approval queue resolves active waiter and clears pending entry", async () => {
  const queue = new ApprovalQueue();
  await queue.enqueue("trace-2", 4, { type: "tool_call", name: "web_search" });

  const resolution = queue.waitForResolution("trace-2", 4, 2000);
  setTimeout(() => {
    queue.resolve("trace-2", 4, "allow", "approved", "admin-1");
  }, 10);

  const result = await resolution;
  assert.equal(result?.action, "allow");
  assert.equal(result?.reason, "approved");
  assert.equal(result?.approverId, "admin-1");
  assert.equal((await queue.getPending()).length, 0);
});

test("approval queue returns cached resolution when resolved before waiting", async () => {
  const queue = new ApprovalQueue();
  await queue.enqueue("trace-3", 5, { type: "tool_call", name: "weather_forecast" });

  const resolved = await queue.resolve("trace-3", 5, "block", "unsafe domain", "admin-2");
  assert.equal(resolved?.action, "block");

  const waited = await queue.waitForResolution("trace-3", 5, 1000);
  assert.equal(waited?.action, "block");
  assert.equal(waited?.reason, "unsafe domain");

  const consumed = await queue.waitForResolution("trace-3", 5, 1000);
  assert.equal(consumed, null);
});

test("approval queue resolves across queue instances sharing the same DB", async () => {
  const pool = createSharedApprovalPool();
  const requester = new ApprovalQueue({ pollIntervalMs: 10 });
  const approver = new ApprovalQueue({ pollIntervalMs: 10 });
  requester.pool = pool;
  approver.pool = pool;

  await requester.enqueue("trace-4", 2, { type: "tool_call", name: "fetch_url" }, { timeoutMs: 500 });

  const waiting = requester.waitForResolution("trace-4", 2, 500);
  setTimeout(() => {
    approver.resolve("trace-4", 2, "allow", "approved remotely", "admin-remote").catch(() => {});
  }, 25);

  const result = await waiting;
  assert.deepEqual(result, {
    action: "allow",
    reason: "approved remotely",
    approverId: "admin-remote",
    resolvedAt: result.resolvedAt,
  });
  assert.match(result.resolvedAt, /\d{4}-\d{2}-\d{2}T/);
});

test("approval queue wakes multiple concurrent waiters for the same approval", async () => {
  const queue = new ApprovalQueue();
  await queue.enqueue("trace-5", 7, { type: "tool_call", name: "web_search" });

  const waiterA = queue.waitForResolution("trace-5", 7, 1000);
  const waiterB = queue.waitForResolution("trace-5", 7, 1000);

  setTimeout(() => {
    queue.resolve("trace-5", 7, "block", "denied", "admin-3").catch(() => {});
  }, 10);

  const [resultA, resultB] = await Promise.all([waiterA, waiterB]);
  assert.equal(resultA?.action, "block");
  assert.equal(resultB?.action, "block");
  assert.equal(resultA?.reason, "denied");
  assert.equal(resultB?.approverId, "admin-3");
});

test("approval queue marks timed out approvals in shared DB state", async () => {
  const pool = createSharedApprovalPool();
  const queue = new ApprovalQueue({ pollIntervalMs: 10 });
  queue.pool = pool;

  await queue.enqueue("trace-6", 9, { type: "tool_call", name: "dangerous_op" }, { timeoutMs: 50 });

  const result = await queue.waitForResolution("trace-6", 9, 50);
  assert.equal(result, null);

  const record = pool.approvals.get("trace-6:9");
  assert.equal(record?.status, "timed_out");
  assert.match(String(record?.resolved_at), /\d{4}-\d{2}-\d{2}T/);
});
