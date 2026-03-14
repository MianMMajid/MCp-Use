import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/frontend/unit/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["tests/frontend/setup/vitest-setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "tests/frontend/coverage",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 70,
      },
      include: [
        "frontend/frontendA-it-console/public/judges-auth.js",
        "frontend/frontendA-it-console/public/judges-http.js",
        "frontend/frontendA-it-console/template-runtime/src/lib/**/*.js",
        "frontend/frontendB-desktop-app/app/desktop-ui.js",
        "frontend/frontendB-desktop-app/template-runtime/src/lib/**/*.js",
        "frontend/frontendC-marketing-download-site/public/landing.js",
        "frontend/frontendD-mcp-widgets/src/**/*.ts",
      ],
      exclude: ["**/*.d.ts", "**/*.test.*", "**/__tests__/**"],
    },
  },
});
