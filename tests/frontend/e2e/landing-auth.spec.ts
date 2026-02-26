import { expect, test } from "@playwright/test";

test.describe("landing auth flows", () => {
  test("sign-in enforces required username/password fields", async ({ page }) => {
    await page.goto("/landing.html");

    const submitButton = page.locator("#signinForm button[type=submit]");

    await submitButton.click();
    await expect(page.locator("#username")).toBeFocused();
    await expect(page).toHaveURL(/\/landing\.html$/);

    await page.fill("#username", "operator");
    await submitButton.click();
    await expect(page.locator("#password")).toBeFocused();
    await expect(page).toHaveURL(/\/landing\.html$/);
  });

  test("successful sign-in sanitizes stored username and redirects to judge", async ({
    page,
  }) => {
    await page.goto("/landing.html?next=/judge");

    await page.fill("#username", `bad<user>"'&`);
    await page.fill("#password", "super-secret");
    await page.getByRole("button", { name: "Open Dashboard" }).click();

    await page.waitForURL("**/judge");
    await expect(page.getByTestId("judge-home")).toHaveText("Judge Dashboard");

    const savedUsername = await page.evaluate(() => localStorage.getItem("maple_judge_username"));
    expect(savedUsername).toBe("baduser");
  });

  test("unsafe next redirects are ignored after successful login", async ({ page }) => {
    await page.goto("/landing.html?next=//evil.example");

    await page.fill("#username", "operator");
    await page.fill("#password", "super-secret");
    await page.getByRole("button", { name: "Open Dashboard" }).click();

    await page.waitForURL("**/judge");
    await expect(page.getByTestId("judge-home")).toHaveText("Judge Dashboard");
  });

  test("shows backend auth error on invalid credentials", async ({ page }) => {
    await page.goto("/landing.html");

    await page.fill("#username", "denied_user");
    await page.fill("#password", "wrong-password");
    await page.getByRole("button", { name: "Open Dashboard" }).click();

    await expect(page.locator("#signinError")).toHaveText("Invalid username or password.");
    await expect(page).toHaveURL(/\/landing\.html$/);
  });

  test("signup maps taken usernames to a clear UI error", async ({ page }) => {
    await page.goto("/landing.html");

    await page.locator("#tabSignUp").click();
    await page.fill("#signupUsername", "taken_user");
    await page.fill("#signupEmail", "taken@example.com");
    await page.fill("#signupPassword", "strong-pass-123");
    await page.locator("#signupForm button[type=submit]").click();

    await expect(page.locator("#signupError")).toHaveText(
      "That username is not available. Please try another."
    );
    await expect(page.locator("#signupForm button[type=submit]")).toHaveText("Create Account");
  });

  test("successful signup redirects to judge and persists sanitized username", async ({ page }) => {
    await page.goto("/landing.html?next=/judge/path-ok");

    await page.locator("#tabSignUp").click();
    await page.fill("#signupUsername", "valid_user");
    await page.fill("#signupEmail", "valid@example.com");
    await page.fill("#signupPassword", "strong-pass-123");
    await page.locator("#signupForm button[type=submit]").click();

    await page.waitForURL("**/judge/path-ok");
    await expect(page.getByTestId("judge-home")).toHaveText("Judge Dashboard");
    await expect(page.getByTestId("judge-path")).toHaveText("/judge/path-ok");

    const savedUsername = await page.evaluate(() => localStorage.getItem("maple_judge_username"));
    expect(savedUsername).toBe("valid_user");
  });
});
