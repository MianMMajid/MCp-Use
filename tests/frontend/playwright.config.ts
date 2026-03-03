import { defineConfig, devices } from "@playwright/test";

const frontendAPort = Number(process.env.PLAYWRIGHT_FRONTEND_A_PORT ?? 4101);
const frontendBPort = Number(process.env.PLAYWRIGHT_FRONTEND_B_PORT ?? 4102);
const frontendCPort = Number(process.env.PLAYWRIGHT_FRONTEND_C_PORT ?? 4103);
const landingPort = Number(process.env.PLAYWRIGHT_LANDING_PORT ?? 4173);

const frontendAExternalBaseURL = process.env.PLAYWRIGHT_FRONTEND_A_URL;
const frontendBExternalBaseURL = process.env.PLAYWRIGHT_FRONTEND_B_URL;
const frontendCExternalBaseURL = process.env.PLAYWRIGHT_FRONTEND_C_URL ?? process.env.FRONTEND_BASE_URL;
const landingExternalBaseURL = process.env.PLAYWRIGHT_LANDING_URL;

const frontendABaseURL = frontendAExternalBaseURL ?? `http://127.0.0.1:${frontendAPort}`;
const frontendBBaseURL = frontendBExternalBaseURL ?? `http://127.0.0.1:${frontendBPort}`;
const frontendCBaseURL = frontendCExternalBaseURL ?? `http://127.0.0.1:${frontendCPort}`;
const landingBaseURL = landingExternalBaseURL ?? `http://127.0.0.1:${landingPort}`;

const webServers = [
  !frontendAExternalBaseURL
    ? {
        command: `npm --prefix ../../frontend/frontendA-it-console/template-runtime run dev -- --port ${frontendAPort}`,
        url: `${frontendABaseURL}/maple/observability`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : null,
  !frontendBExternalBaseURL
    ? {
        command: `NEXT_PUBLIC_DISABLE_REACTFLOW=1 npm --prefix ../../frontend/frontendB-desktop-app/template-runtime run dev -- --port ${frontendBPort}`,
        url: `${frontendBBaseURL}/orchestrate`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : null,
  !frontendCExternalBaseURL
    ? {
        command: `npm --prefix ../../frontend/frontendC-marketing-download-site/template-runtime run dev -- --port ${frontendCPort}`,
        url: `${frontendCBaseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : null,
  !landingExternalBaseURL
    ? {
        command: `PLAYWRIGHT_TEST_PORT=${landingPort} node e2e/test-server.mjs`,
        url: `${landingBaseURL}/landing.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : null,
].filter(Boolean);

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  outputDir: "artifacts/playwright",
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  webServer: webServers.length > 0 ? webServers : undefined,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "frontendA-chromium",
      use: { ...devices["Desktop Chrome"], baseURL: frontendABaseURL },
      testMatch: /.*frontendA\.spec\.ts/,
    },
    {
      name: "frontendB-chromium",
      use: { ...devices["Desktop Chrome"], baseURL: frontendBBaseURL },
      testMatch: /.*frontendB\.spec\.ts/,
    },
    {
      name: "frontendC-chromium",
      use: { ...devices["Desktop Chrome"], baseURL: frontendCBaseURL },
      testMatch: /.*template-runtime\.spec\.ts/,
    },
    {
      name: "frontendC-landing-chromium",
      use: { ...devices["Desktop Chrome"], baseURL: landingBaseURL },
      testMatch: /.*landing-auth\.spec\.ts/,
    },
  ],
});
