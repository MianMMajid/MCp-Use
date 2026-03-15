import { expect, test } from "@playwright/test";

function asJson(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

test.describe("frontend B skills import and governed proof", () => {
  test("imports a registry skill and shows governed execution proof", async ({ page }) => {
    const baseURL = String(test.info().project.use.baseURL);
    await page.context().addCookies([
      { name: "maple_session", value: "playwright-session", url: baseURL },
    ]);

    const items = [
      {
        toolId: "skills",
        name: "skills",
        description: "OpenClaw skills command group",
        category: "engineering",
        tags: ["#engineering"],
        status: "connected",
        source: "openclaw-cli",
      },
      {
        toolId: "status",
        name: "status",
        description: "OpenClaw status command",
        category: "engineering",
        tags: ["#engineering"],
        status: "connected",
        source: "openclaw-cli",
      },
    ];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const method = request.method();
      const url = new URL(request.url());
      const path = url.pathname;

      if (path === "/api/skills" && method === "GET") {
        await route.fulfill(asJson({ ok: true, items }));
        return;
      }

      if (path === "/api/skills/import" && method === "POST") {
        const body = request.postDataJSON();
        const record = {
          toolId: String(body.toolId),
          name: String(body.name),
          description: String(body.description),
          category: "engineering",
          tags: ["#engineering"],
          status: "connected",
          source: "registry",
        };
        const existingIndex = items.findIndex((item) => item.toolId === record.toolId);
        if (existingIndex >= 0) {
          items.splice(existingIndex, 1, record);
        } else {
          items.unshift(record);
        }
        await route.fulfill(
          asJson({
            ok: true,
            tool: record,
            storage: {
              persistent: true,
              registryRecord: {
                toolId: record.toolId,
                name: record.name,
                description: record.description,
                schemaJson: "{}",
                source: "manual",
                createdAt: "2026-03-14T12:00:00.000Z",
                updatedAt: "2026-03-14T12:00:00.000Z",
              },
            },
          }),
        );
        return;
      }

      if (path === "/api/skills/skills/governed-execution" && method === "POST") {
        await route.fulfill(
          asJson({
            ok: true,
            type: "executed",
            result: {
              ok: true,
              tool: "skills",
              command: "openclaw",
              args: ["skills", "list"],
              parsedJson: {
                ok: true,
                items: ["skills", "memory", "status"],
              },
              exitCode: 0,
            },
            proof: {
              toolId: "skills",
              command: ["list"],
              storage: {
                persistent: true,
                registryRecord: {
                  toolId: "skills",
                  source: "manual",
                },
              },
              audit: {
                total: 2,
                events: [
                  { eventType: "AUDIT_EVENT_TYPE_TOOL_DISPATCHED" },
                  { eventType: "AUDIT_EVENT_TYPE_TOOL_COMPLETED" },
                ],
              },
            },
          }),
        );
        return;
      }

      if (path === "/api/skills/skills/smoke-test" && method === "POST") {
        await route.fulfill(
          asJson({
            ok: true,
            result: {
              passed: true,
              checkedAt: "2026-03-14T12:00:00.000Z",
              logs: ["PASS Catalog resolution: Resolved skills"],
            },
          }),
        );
        return;
      }

      await route.fulfill(asJson({ ok: true }));
    });

    await page.goto("/skills");

    await page.locator('input[placeholder="skills"]').first().fill("skills");
    await page.locator('input[placeholder="skills"]').nth(1).fill("skills");
    await page.getByRole("button", { name: "Import Skill" }).click();

    await expect(page.getByText("Imported skills")).toBeVisible();
    await expect(page.getByText("Registry import")).toBeVisible();

    await page.getByRole("button", { name: "Governed List Proof" }).click();

    await expect(page.getByText("Governed list proof succeeded")).toBeVisible();
    await expect(page.getByText(/AUDIT_EVENT_TYPE_TOOL_COMPLETED/)).toBeVisible();
    await expect(page.getByText(/"tool": "skills"/)).toBeVisible();
  });
});
