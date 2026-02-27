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
        "tests/frontend/unit/**/*.test.ts",
      ],
      exclude: ["**/*.d.ts"],
    },
  },
});
