import { expect, test } from "@playwright/test";

type JsonValue = Record<string, unknown> | Array<unknown>;

function json(data: JsonValue) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  };
}

test.describe("frontend A observability and safeguards wiring", () => {
  test("observability page calls canonical observability APIs", async ({ page }) => {
    const baseURL = String(test.info().project.use.baseURL);
    await page.context().addCookies([
      { name: "maple_session", value: "playwright-session", url: baseURL },
    ]);

    const hits = new Set<string>();

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const key = `${method} ${path}`;

      if (path.startsWith("/api/observability/orchestrations")) {
        hits.add(key);
      }

      if (path === "/api/observability/orchestrations/summary") {
        await route.fulfill(json({ ok: true, totalExecutions: 8, activeExecutions: 2, approvalsPending: 1, byStatus: { completed: 5, failed: 1, canceled: 0 }, outbox: { pending: 0, deadLetter: 0 } }));
        return;
      }
      if (path === "/api/observability/orchestrations/slo") {
        await route.fulfill(json({ ok: true, healthy: true, windowMs: Number(url.searchParams.get("windowMs") ?? 3600000) }));
        return;
      }
      if (path === "/api/observability/orchestrations/audit-log") {
        await route.fulfill(json({ ok: true, items: [{ id: "evt-1", eventType: "execution_started", actor: "operator", timestamp: "2026-03-03T10:00:00.000Z" }], nextOffset: null }));
        return;
      }
      if (path === "/api/observability/orchestrations/alert-webhooks") {
        await route.fulfill(json({ ok: true, items: [] }));
        return;
      }
      if (path === "/api/observability/orchestrations/export" && method === "POST") {
        await route.fulfill(json({ ok: true, total: 1, items: [{ id: "evt-1" }] }));
        return;
      }
      if (path === "/api/observability/orchestrations/flush" && method === "POST") {
        await route.fulfill(json({ ok: true, flushed: 1 }));
        return;
      }

      await route.fulfill(json({ ok: true, items: [], events: [], entries: [] }));
    });

    await page.goto("/maple/observability");

    await expect(page.getByRole("heading", { name: /Observability & Alerts/i })).toBeVisible();
    await expect(page.getByText(/Overview Metrics/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Audit Log/i })).toBeVisible();

    await page.getByRole("button", { name: /Export to SIEM/i }).click();
    await page.getByRole("button", { name: /Flush Outbox/i }).click();

    expect(hits.has("GET /api/observability/orchestrations/summary")).toBeTruthy();
    expect(hits.has("GET /api/observability/orchestrations/slo")).toBeTruthy();
    expect(hits.has("GET /api/observability/orchestrations/audit-log")).toBeTruthy();
    expect(hits.has("POST /api/observability/orchestrations/export")).toBeTruthy();
    expect(hits.has("POST /api/observability/orchestrations/flush")).toBeTruthy();
  });

  test("audit page supports forking and dead-letter replay via canonical APIs", async ({ page }) => {
    const baseURL = String(test.info().project.use.baseURL);
    await page.context().addCookies([
      { name: "maple_session", value: "playwright-session", url: baseURL },
    ]);

    const hits = new Set<string>();

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const key = `${method} ${path}`;

      if (path.startsWith("/api/observability/orchestrations")) {
        hits.add(key);
      }

      if (path === "/api/observability/orchestrations/audit-log") {
        await route.fulfill(json({ ok: true, items: [{ id: "audit-1", eventType: "execution_failed", severity: "warning", createdAt: "2026-03-03T10:05:00.000Z", summary: "Node retry requested" }], nextOffset: null }));
        return;
      }
      if (path === "/api/observability/orchestrations/export" && method === "POST") {
        await route.fulfill(json({ ok: true, total: 1 }));
        return;
      }
      if (path === "/api/observability/orchestrations/flush" && method === "POST") {
        await route.fulfill(json({ ok: true }));
        return;
      }
      if (path === "/api/observability/orchestrations/audit-chain") {
        await route.fulfill(json({ ok: true, items: [{ id: "chain-1", eventType: "execution_failed", timestamp: "2026-03-03T10:05:00.000Z" }] }));
        return;
      }
      if (path === "/api/observability/orchestrations/audit-chain/verify") {
        await route.fulfill(json({ ok: true, valid: true, checked: 1 }));
        return;
      }
      if (path === "/api/observability/orchestrations/retention") {
        if (method === "GET") {
          await route.fulfill(json({ ok: true, retentionDays: 90 }));
          return;
        }
        await route.fulfill(json({ ok: true, retentionDays: 120 }));
        return;
      }
      if (path === "/api/observability/orchestrations/retention/enforce") {
        await route.fulfill(json({ ok: true, affectedRows: 1 }));
        return;
      }
      if (path === "/api/observability/orchestrations/dead-letter") {
        await route.fulfill(json({ ok: true, items: [{ outboxId: "dlq-1", attempts: 2, lastError: "network timeout" }] }));
        return;
      }
      if (path === "/api/observability/orchestrations/dead-letter/dlq-1/replay" && method === "POST") {
        await route.fulfill(json({ ok: true }));
        return;
      }
      if (path === "/api/observability/orchestrations/executions/exec-parent-1/fork" && method === "POST") {
        await route.fulfill(json({ ok: true, forkExecutionId: "exec-fork-1", parentExecutionId: "exec-parent-1", launchedAt: "2026-03-03T10:10:00.000Z" }));
        return;
      }

      await route.fulfill(json({ ok: true, items: [] }));
    });

    await page.goto("/maple/audit");
    await expect(page.getByRole("heading", { name: /Audit & Compliance Operations/i })).toBeVisible();

    await page.getByPlaceholder("execution id").fill("exec-parent-1");
    await page.getByRole("button", { name: /Fork Execution/i }).click();

    await page.getByRole("button", { name: "Dead Letter" }).click();
    await page.getByRole("button", { name: /Replay/i }).click();

    expect(hits.has("POST /api/observability/orchestrations/executions/exec-parent-1/fork")).toBeTruthy();
    expect(hits.has("POST /api/observability/orchestrations/dead-letter/dlq-1/replay")).toBeTruthy();
  });
});
