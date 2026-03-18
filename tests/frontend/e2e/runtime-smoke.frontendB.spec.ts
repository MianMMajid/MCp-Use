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

test.describe("frontend B runtime smoke", () => {
  test("login route renders without loading the app runtime", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await route.fulfill(asJson({ ok: true, items: [] }));
    });

    await page.goto(absoluteUrl("/login"));

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator('label[for="auth-email"]')).toBeVisible();
    await expect(page.locator('label[for="auth-password"]')).toBeVisible();
  });

  test("authenticated app routes still bootstrap the desktop runtime", async ({ page }) => {
    const baseURL = resolvedBaseUrl();
    await page.context().addCookies([
      { name: "maple_session", value: "playwright-session", url: baseURL },
    ]);

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname === "/api/auth/me") {
        await route.fulfill(asJson({ user: { id: "user-1", email: "operator@example.com" } }));
        return;
      }

      if (url.pathname === "/api/agents") {
        await route.fulfill(asJson({ items: [] }));
        return;
      }

      if (url.pathname === "/api/orchestrations") {
        await route.fulfill(asJson({ items: [] }));
        return;
      }

      if (url.pathname === "/api/skills") {
        await route.fulfill(
          asJson({
            ok: true,
            items: [
              {
                toolId: "skills",
                name: "skills",
                description: "OpenClaw skills command group",
                source: "openclaw-cli",
                status: "connected",
              },
            ],
          }),
        );
        return;
      }

      await route.fulfill(asJson({ ok: true, items: [] }));
    });

    await page.goto(absoluteUrl("/skills"));

    await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
  });

  test("sessions route restores persisted agent selection from local storage", async ({ page }) => {
    const baseURL = resolvedBaseUrl();
    await page.context().addCookies([
      { name: "maple_session", value: "playwright-session", url: baseURL },
    ]);

    await page.addInitScript(() => {
      window.localStorage.setItem("selectedAgentId", "agent-1");
      window.localStorage.setItem("mayple_chat_mode", "agent");
      window.localStorage.setItem("mayple_stack_mode", "frontend");
    });

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname === "/api/auth/me") {
        await route.fulfill(asJson({ user: { id: "user-1", email: "operator@example.com" } }));
        return;
      }

      if (url.pathname === "/api/agents") {
        await route.fulfill(
          asJson({
            items: [{ id: "agent-1", agentId: "agent-1", name: "Agent One", status: "active" }],
          }),
        );
        return;
      }

      if (url.pathname === "/api/orchestrations") {
        await route.fulfill(asJson({ items: [] }));
        return;
      }

      if (url.pathname === "/api/agents/agent-1/sessions") {
        await route.fulfill(
          asJson({
            items: [{ sessionId: "session-1", title: "Recovered session", createdAt: "2026-03-15T12:00:00.000Z" }],
          }),
        );
        return;
      }

      await route.fulfill(asJson({ ok: true, items: [] }));
    });

    await page.goto(absoluteUrl("/sessions"));

    await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Recovered session/ }).first()).toBeVisible();
    await expect(page.getByText("Select an agent in chat to load sessions.")).not.toBeVisible();
  });
});
