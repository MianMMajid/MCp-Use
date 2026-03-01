/**
 * load-test.test.mjs
 *
 * Concurrent multi-tenant load tests that exercise:
 * - Rate limiter under parallel requests
 * - Leader election contention
 * - Outbox flush under load
 * - Modifier governance evaluation throughput
 *
 * These tests use in-process mocks (no live DB required).
 * Run with: node --test backend/backendB-core-services/gateway-api/service/tests/load-test.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

// ── Rate Limiter Concurrency ─────────────────────────────────────────────

test("rate limiter handles concurrent multi-tenant requests", async () => {
  // Simulate a sliding-window rate limiter in-memory
  const windows = new Map();
  const QUOTA = 10;
  const WINDOW_MS = 1000;

  function checkRate(tenantId) {
    const key = tenantId;
    const now = Date.now();
    if (!windows.has(key)) {
      windows.set(key, []);
    }
    const window = windows.get(key);
    // Purge expired entries
    while (window.length > 0 && window[0] < now - WINDOW_MS) {
      window.shift();
    }
    if (window.length >= QUOTA) {
      return { allowed: false, rate: window.length, quota: QUOTA };
    }
    window.push(now);
    return { allowed: true, rate: window.length, quota: QUOTA };
  }

  const tenants = ["tenant-a", "tenant-b", "tenant-c"];
  const requestsPerTenant = 20;
  const results = { allowed: 0, rejected: 0 };

  // Fire concurrent requests across all tenants
  const promises = [];
  for (const tenant of tenants) {
    for (let i = 0; i < requestsPerTenant; i++) {
      promises.push(
        Promise.resolve().then(() => {
          const result = checkRate(tenant);
          if (result.allowed) results.allowed++;
          else results.rejected++;
          return result;
        })
      );
    }
  }
  await Promise.all(promises);

  // Each tenant should allow exactly QUOTA requests, reject the rest
  assert.equal(results.allowed, tenants.length * QUOTA);
  assert.equal(results.rejected, tenants.length * (requestsPerTenant - QUOTA));
});

// ── Leader Election Contention ───────────────────────────────────────────

test("leader election prevents duplicate worker execution", async () => {
  // Simulate pg_advisory_lock with an in-memory lock map
  const locks = new Map();
  let executionCount = 0;

  async function withLock(lockId, fn) {
    if (locks.get(lockId)) {
      return { skipped: true };
    }
    locks.set(lockId, true);
    try {
      return await fn();
    } finally {
      locks.delete(lockId);
    }
  }

  // Simulate 5 worker instances all trying to run at the same time
  const workerCount = 5;
  const promises = [];
  for (let i = 0; i < workerCount; i++) {
    promises.push(
      withLock("escalation_worker", async () => {
        executionCount++;
        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { executed: true };
      })
    );
  }

  const results = await Promise.all(promises);
  const executed = results.filter((r) => r?.executed).length;
  const skipped = results.filter((r) => r?.skipped).length;

  // Only one worker should have executed
  assert.equal(executed, 1);
  assert.equal(skipped, workerCount - 1);
  assert.equal(executionCount, 1);
});

// ── Outbox Flush Under Load ──────────────────────────────────────────────

test("outbox flush handles batch of events without loss", async () => {
  const eventCount = 200;
  const batchSize = 50;
  const outbox = [];
  const delivered = [];

  // Enqueue events
  for (let i = 0; i < eventCount; i++) {
    outbox.push({
      id: `event-${i}`,
      eventType: "AUDIT_EVENT_TYPE_TOOL_DISPATCHED",
      tenantId: `tenant-${i % 5}`,
      status: "pending",
      attempts: 0,
    });
  }

  // Simulate flush batches
  async function flushBatch() {
    const batch = outbox.splice(0, batchSize);
    for (const event of batch) {
      // Simulate gRPC delivery (10% failure rate)
      if (Math.random() < 0.1) {
        event.attempts++;
        if (event.attempts < 3) {
          outbox.push(event); // Re-queue for retry
        }
        // else: dead-lettered
      } else {
        event.status = "delivered";
        delivered.push(event);
      }
    }
    return { flushed: batch.length };
  }

  // Run multiple flush cycles
  let cycles = 0;
  while (outbox.length > 0 && cycles < 20) {
    await flushBatch();
    cycles++;
  }

  // Verify most events were delivered (at least 80% given 10% failure rate)
  assert.ok(delivered.length >= eventCount * 0.8, `Expected at least ${eventCount * 0.8} delivered, got ${delivered.length}`);
});

// ── Modifier Governance Throughput ───────────────────────────────────────

test("modifier governance evaluates multiple tools concurrently", async () => {
  const policy = {
    allowedTools: ["read", "write", "list", "search", "delete"],
    dangerousTools: ["delete", "reset"],
    blockedTargetProfiles: ["production"],
  };

  function evaluateGovernance(toolName) {
    const tool = String(toolName).trim().toLowerCase();
    if (!tool) return { allowed: true, reason: "no_tool_name" };
    if (policy.allowedTools.length > 0 && !policy.allowedTools.includes(tool)) {
      return { allowed: false, reason: `Tool '${tool}' not allowlisted.` };
    }
    if (policy.dangerousTools.includes(tool)) {
      return { allowed: false, reason: `Tool '${tool}' requires approval.`, requiresApproval: true };
    }
    return { allowed: true, reason: "allowed_by_policy" };
  }

  const toolCalls = [];
  for (let i = 0; i < 100; i++) {
    toolCalls.push(["read", "write", "delete", "unknown-tool", "list"][i % 5]);
  }

  const results = await Promise.all(
    toolCalls.map((tool) => Promise.resolve(evaluateGovernance(tool)))
  );

  const allowed = results.filter((r) => r.allowed).length;
  const blocked = results.filter((r) => !r.allowed && !r.requiresApproval).length;
  const needsApproval = results.filter((r) => r.requiresApproval).length;

  // 20 "read" + 20 "write" + 20 "list" = 60 allowed
  assert.equal(allowed, 60);
  // 20 "unknown-tool" = blocked
  assert.equal(blocked, 20);
  // 20 "delete" = needs approval
  assert.equal(needsApproval, 20);
});

// ── Multi-Tenant Isolation ───────────────────────────────────────────────

test("multi-tenant operations maintain isolation", async () => {
  const tenantData = new Map();

  function setPolicy(tenantId, orgId, policy) {
    const key = `${tenantId}::${orgId}`;
    tenantData.set(key, policy);
  }

  function getPolicy(tenantId, orgId) {
    const key = `${tenantId}::${orgId}`;
    return tenantData.get(key) ?? null;
  }

  // Set up policies for different tenants concurrently
  const ops = [];
  for (let t = 0; t < 10; t++) {
    for (let o = 0; o < 3; o++) {
      ops.push(
        Promise.resolve().then(() => {
          setPolicy(`tenant-${t}`, `org-${o}`, {
            allowedTools: [`tool-${t}-${o}`],
            dangerousTools: [],
          });
        })
      );
    }
  }
  await Promise.all(ops);

  // Verify isolation — each tenant-org combo has its own policy
  for (let t = 0; t < 10; t++) {
    for (let o = 0; o < 3; o++) {
      const policy = getPolicy(`tenant-${t}`, `org-${o}`);
      assert.ok(policy, `Policy missing for tenant-${t}/org-${o}`);
      assert.deepEqual(policy.allowedTools, [`tool-${t}-${o}`]);

      // Ensure no cross-tenant leakage
      const otherPolicy = getPolicy(`tenant-${(t + 1) % 10}`, `org-${o}`);
      assert.notDeepEqual(policy.allowedTools, otherPolicy.allowedTools);
    }
  }

  assert.equal(tenantData.size, 30);
});
