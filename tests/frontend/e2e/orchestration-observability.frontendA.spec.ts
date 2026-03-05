import { expect, test } from "@playwright/test";

type JsonValue = Record<string, unknown> | Array<unknown>;

function json(data: JsonValue) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  };
}

test.describe("frontend A monitoring + intervention workspace", () => {
  test("canonical /maple workspace renders observability modules and docs panel", async ({ page }) => {
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
        await route.fulfill(
          json({
            ok: true,
            totalExecutions: 9,
            activeExecutions: 3,
            approvalsPending: 1,
            byStatus: { completed: 5, failed: 1, canceled: 1 },
          }),
        );
        return;
      }
      if (path === "/api/observability/orchestrations/slo") {
        await route.fulfill(
          json({ ok: true, healthy: true, windowMs: Number(url.searchParams.get("windowMs") ?? 3600000) }),
        );
        return;
      }
      if (path === "/api/observability/orchestrations/audit-log") {
        await route.fulfill(
          json({
            ok: true,
            items: [
              {
                id: "evt-1",
                eventType: "execution_started",
                source: "frontend-b/orchestrate",
                executionId: "exec-1",
                timestamp: "2026-03-03T10:00:00.000Z",
              },
            ],
            nextOffset: null,
          }),
        );
        return;
      }
      if (path === "/api/observability/orchestrations/alert-webhooks") {
        await route.fulfill(json({ ok: true, items: [] }));
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
      if (path === "/api/hitl/approvals") {
        await route.fulfill(json({ ok: true, approvals: [] }));
        return;
      }
      if (path === "/api/firewall/chat" && method === "POST") {
        await route.fulfill(json({ ok: true, reply: "Monitoring posture is stable." }));
        return;
      }
      await route.fulfill(json({ ok: true, items: [], approvals: [], events: [] }));
    });

    await page.goto("/maple");

    await expect(page.getByTestId("maple-workspace-layout")).toBeVisible();
    await expect(page.getByTestId("maple-workspace-shell")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Observability & Alerts/i })).toBeVisible();
    await expect(page.getByTestId("monitoring-context-explainer")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Intervention Command Bar/i })).toBeVisible();
    await expect(page.getByTestId("maple-docs-panel")).toBeVisible();
    await expect(page.getByTestId("maple-docs-panel")).toContainText(/Context Docs/i);

    await page.getByTestId("maple-docs-toggle").click();
    await expect(page.getByTestId("maple-docs-panel")).toHaveAttribute("aria-hidden", "true");
    await page.getByTestId("maple-docs-toggle").click();
    await expect(page.getByTestId("maple-docs-panel")).toHaveAttribute("aria-hidden", "false");

    expect(hits.has("GET /api/observability/orchestrations/summary")).toBeTruthy();
    expect(hits.has("GET /api/observability/orchestrations/slo")).toBeTruthy();
    expect(hits.has("GET /api/observability/orchestrations/audit-log")).toBeTruthy();
  });

  test("legacy /maple/audit deep-links into canonical workspace and intervention actions call APIs", async ({ page }) => {
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
      hits.add(key);

      if (path === "/api/observability/orchestrations/summary") {
        await route.fulfill(json({ ok: true, activeExecutions: 2, approvalsPending: 1, byStatus: { failed: 1, canceled: 0 } }));
        return;
      }
      if (path === "/api/observability/orchestrations/audit-log") {
        await route.fulfill(
          json({
            ok: true,
            items: [
              {
                id: "audit-1",
                source: "frontend-b/orchestrate",
                executionId: "exec-parent-1",
                sessionId: "sess-9",
                eventType: "execution_failed",
                severity: "warning",
                timestamp: "2026-03-03T10:05:00.000Z",
              },
            ],
            nextOffset: null,
          }),
        );
        return;
      }
      if (path === "/api/hitl/approvals") {
        await route.fulfill(json({ ok: true, approvals: [] }));
        return;
      }
      if (path === "/api/orchestrations/executions/exec-parent-1/pause" && method === "POST") {
        await route.fulfill(json({ ok: true }));
        return;
      }
      if (path === "/api/orchestrations/executions/exec-parent-1/resume" && method === "POST") {
        await route.fulfill(json({ ok: true }));
        return;
      }
      if (path === "/api/orchestrations/executions/exec-parent-1/cancel" && method === "POST") {
        await route.fulfill(json({ ok: true }));
        return;
      }
      if (path === "/api/firewall/chat" && method === "POST") {
        await route.fulfill(json({ ok: true, reply: "Use pause then retry-node." }));
        return;
      }
      await route.fulfill(json({ ok: true, items: [], approvals: [], events: [] }));
    });

    await page.goto("/maple/audit");
    await expect(page).toHaveURL(/\/maple\?/);
    await expect(page.getByRole("heading", { name: /Audit & Compliance Operations/i })).toBeVisible();

    await page.getByLabel("Execution ID").fill("exec-parent-1");
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Resume" }).click();

    await page.getByLabel(/Reason/i).fill("unsafe output in runtime");
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await page.getByRole("button", { name: "Confirm" }).click();

    expect(hits.has("POST /api/orchestrations/executions/exec-parent-1/pause")).toBeTruthy();
    expect(hits.has("POST /api/orchestrations/executions/exec-parent-1/resume")).toBeTruthy();
    expect(hits.has("POST /api/orchestrations/executions/exec-parent-1/cancel")).toBeTruthy();
  });

  test("category pills include Docs and docs tabs render runbook content", async ({ page }) => {
    const baseURL = String(test.info().project.use.baseURL);
    await page.context().addCookies([
      { name: "maple_session", value: "playwright-session", url: baseURL },
    ]);

    await page.route("**/api/**", async (route) => {
      await route.fulfill(json({ ok: true, items: [], approvals: [], events: [], byStatus: {} }));
    });

    await page.goto("/maple");

    await page
      .getByRole("navigation", { name: /workspace categories/i })
      .getByRole("button", { name: /Docs/i })
      .click();
    await expect(page).toHaveURL(/category=docs/);
    await page.getByRole("tab", { name: /Runbooks/i }).click();
    await expect(page).toHaveURL(/view=runbooks/);
    await expect(page.getByRole("heading", { name: /Docs: Runbooks/i })).toBeVisible();
    await expect(page.getByText(/Pause execution to stop blast radius/i)).toBeVisible();
  });
});
