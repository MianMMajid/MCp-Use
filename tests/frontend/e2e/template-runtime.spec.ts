import { expect, test } from "@playwright/test";

test.describe("frontend C template runtime", () => {
  test("home page renders journey and desktop download call-to-action", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /Build and operate your agent orchestration/i })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /A\/B\/C operating journey/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Download for macOS/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Download for Windows/i })).toBeVisible();
    await expect(page.getByText(/Runtime Control Plane/i)).toHaveCount(0);
    await expect(page.getByText(/Observability & Alerts/i)).toHaveCount(0);
  });

  test("login route renders sign-in form controls", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /Sign in to your account/i })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
  });

  test("register route renders onboarding fields", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: /Get started for free/i })).toBeVisible();
    await expect(page.getByLabel("First name")).toBeVisible();
    await expect(page.getByLabel("Last name")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign up/i })).toBeVisible();
  });
});
