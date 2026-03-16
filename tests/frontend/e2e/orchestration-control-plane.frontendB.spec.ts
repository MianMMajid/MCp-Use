import { expect, test } from "@playwright/test";

function resolvedBaseUrl() {
  return String(test.info().project.use.baseURL || "http://127.0.0.1:4102");
}

function absoluteUrl(path: string) {
  return new URL(path, resolvedBaseUrl()).toString();
}

function asJson(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

test.describe("frontend B orchestration control plane wiring", () => {
  test("runs routes redirect into orchestration chat mode", async ({ page }) => {
    const baseURL = resolvedBaseUrl();
    await page.context().addCookies([
      { name: "maple_session", value: "playwright-session", url: baseURL },
    ]);

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/agents") {
        await route.fulfill(asJson({ items: [] }));
        return;
      }
      if (url.pathname === "/api/orchestrations") {
        await route.fulfill(asJson({ items: [{ id: "orch-1", name: "Ops Loop", status: "active", nodes: [] }] }));
        return;
      }
      if (url.pathname === "/api/orchestrations/orch-1/conversation") {
        await route.fulfill(asJson({ ok: true, items: [], objectivePackage: {} }));
        return;
      }
      if (url.pathname === "/api/orchestrations/executions") {
        await route.fulfill(asJson({ items: [] }));
        return;
      }
      await route.fulfill(asJson({ ok: true }));
    });

    await page.goto(absoluteUrl("/runs"));
    await expect(page).toHaveURL(/\/\?mode=orchestration$/);

    await page.goto(absoluteUrl("/runs/exec-99"));
    await expect(page).toHaveURL(/\/\?mode=orchestration&executionId=exec-99&panel=timeline$/);
  });

  test("runtime command bar maps actions to canonical orchestration APIs", async ({ page }) => {
    const baseURL = resolvedBaseUrl();
    await page.context().addCookies([
      { name: "maple_session", value: "playwright-session", url: baseURL },
    ]);

    const hitCount = new Map<string, number>();

    const bump = (method: string, path: string) => {
      const key = `${method} ${path}`;
      hitCount.set(key, (hitCount.get(key) ?? 0) + 1);
    };

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const method = request.method();
      const url = new URL(request.url());
      const path = url.pathname;

      bump(method, path);

      if (path === "/api/agents") {
        await route.fulfill(asJson({ items: [] }));
        return;
      }
      if (path.startsWith("/api/agents/")) {
        await route.fulfill(asJson({ ok: true, items: [], session: { runs: [] } }));
        return;
      }
      if (path === "/api/orchestrations/orch-1" && method === "GET") {
        await route.fulfill(
          asJson({
            id: "orch-1",
            name: "Customer Intake Orchestration",
            status: "draft",
            nodes: [{ id: "node-1", label: "Gather Inputs", agentId: "agent-a", position: { x: 120, y: 140 } }],
            edges: [],
          }),
        );
        return;
      }
      if (path === "/api/orchestrations/orch-1" && method === "PATCH") {
        await route.fulfill(
          asJson({
            id: "orch-1",
            name: "Customer Intake Orchestration",
            status: "draft",
            nodes: [{ id: "node-1", label: "Gather Inputs", agentId: "agent-a", position: { x: 120, y: 140 } }],
            edges: [],
          }),
        );
        return;
      }
      if (path === "/api/orchestrations/executions") {
        await route.fulfill(asJson({ items: [{ executionId: "exec-1", status: "running" }] }));
        return;
      }
      if (path === "/api/orchestrations/executions/exec-1/snapshot") {
        await route.fulfill(
          asJson({
            ok: true,
            execution: { executionId: "exec-1", status: "running" },
            graph: {
              nodes: [
                { id: "node-1", status: "running" },
                { id: "node-2", status: "failed" },
              ],
              edges: [],
            },
            timeline: [{ id: "evt-1", eventType: "execution_started", timestamp: "2026-03-03T10:00:00.000Z", executionId: "exec-1" }],
            mutations: [],
            approvals: [],
          }),
        );
        return;
      }
      if (path === "/api/orchestrations/orch-1/validate" && method === "POST") {
        await route.fulfill(asJson({ ok: true, errors: [], warnings: [], compiledGraph: { nodes: 1 } }));
        return;
      }
      if (path === "/api/orchestrations/orch-1/publish" && method === "POST") {
        await route.fulfill(asJson({ ok: true, publishedVersion: "v1" }));
        return;
      }
      if (path === "/api/orchestrations/orch-1/execute" && method === "POST") {
        await route.fulfill(asJson({ ok: true, executionId: "exec-1", status: "running" }));
        return;
      }
      if (path === "/api/orchestrations/executions/exec-1/pause" && method === "POST") {
        await route.fulfill(asJson({ ok: true, execution: { executionId: "exec-1", status: "paused" } }));
        return;
      }
      if (path === "/api/orchestrations/executions/exec-1/resume" && method === "POST") {
        await route.fulfill(asJson({ ok: true, execution: { executionId: "exec-1", status: "running" } }));
        return;
      }
      if (path === "/api/orchestrations/executions/exec-1/cancel" && method === "POST") {
        await route.fulfill(asJson({ ok: true, execution: { executionId: "exec-1", status: "canceled" } }));
        return;
      }
      if (path === "/api/orchestrations/executions/exec-1/mutate" && method === "POST") {
        await route.fulfill(asJson({ ok: true, mutationId: "mut-1", appliedAt: "2026-03-03T10:02:00.000Z" }));
        return;
      }

      await route.fulfill(asJson({ ok: true }));
    });

    await page.goto(absoluteUrl("/orchestrate/orch-1"));

    await expect(page.getByText(/Runtime Control Plane/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Validate" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dry Run" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Execute Live" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Observability" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Audit" })).toBeVisible();

    await page.getByRole("button", { name: "Validate" }).click();
    await page.getByRole("button", { name: "Publish Version" }).click();
    await page.getByRole("button", { name: "Execute Live" }).click();

    await expect(page.getByRole("button", { name: "Pause" })).toBeEnabled();
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Resume" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Add Dynamic Node" }).click();

    await expect(page.getByRole("button", { name: /Activate Break-Glass/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Register Webhook/i })).toHaveCount(0);

    expect(hitCount.get("POST /api/orchestrations/orch-1/validate")).toBeGreaterThan(0);
    expect(hitCount.get("POST /api/orchestrations/orch-1/publish")).toBeGreaterThan(0);
    expect(hitCount.get("POST /api/orchestrations/orch-1/execute")).toBeGreaterThan(0);
    expect(hitCount.get("POST /api/orchestrations/executions/exec-1/pause")).toBeGreaterThan(0);
    expect(hitCount.get("POST /api/orchestrations/executions/exec-1/resume")).toBeGreaterThan(0);
    expect(hitCount.get("POST /api/orchestrations/executions/exec-1/cancel")).toBeGreaterThan(0);
    expect(hitCount.get("POST /api/orchestrations/executions/exec-1/mutate")).toBeGreaterThan(0);
  });
});
