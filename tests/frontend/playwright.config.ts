import { defineConfig, devices } from "@playwright/test";

const localPort = Number(process.env.PLAYWRIGHT_TEST_PORT ?? 4103);
const localBaseURL = `http://127.0.0.1:${localPort}`;
const externalBaseURL = process.env.FRONTEND_BASE_URL;
const baseURL = externalBaseURL ?? localBaseURL;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  outputDir: "artifacts/playwright",
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  webServer: externalBaseURL
    ? undefined
    : {
        command: `npm --prefix ../../frontend/frontendC-marketing-download-site/template-runtime run dev -- --port ${localPort}`,
        url: `${localBaseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
