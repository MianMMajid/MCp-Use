import { expect, test } from "@playwright/test";

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

    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });

  test("authenticated app routes still bootstrap the desktop runtime", async ({ page }) => {
    const baseURL = String(test.info().project.use.baseURL);
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

    await page.goto("/skills");

    await expect(page.getByRole("heading", { name: "Skills Toolbox" })).toBeVisible();
    await expect(page.getByText("OpenClaw CLI")).toBeVisible();
  });
});
