import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("template runtime config wiring", () => {
  it("all template runtimes rewrite /api through gateway and /admin/api through admin console", () => {
    // Frontend C uses Next.js config with rewrite rules
    const frontendCNextConfig = read("frontend/frontendC-marketing-download-site/template-runtime/next.config.js");
    expect(frontendCNextConfig).toContain("source: '/api/:path*'");
    expect(frontendCNextConfig).toContain("destination: `${mapleGatewayOrigin}/api/:path*`");
    expect(frontendCNextConfig).toContain("source: '/admin/api/:path*'");
    expect(frontendCNextConfig).toContain("destination: `${mapleAdminConsoleOrigin}/admin/api/:path*`");

    // Frontend A uses SvelteKit server routes for API proxying via origin helper
    const frontendAProxy = read("frontend/frontendA-it-console/template-runtime/src/routes/api/[...path]/+server.js");
    expect(frontendAProxy).toContain("getGatewayOrigin");

    // Frontend B uses SvelteKit server routes for API proxying
    const frontendBProxy = read("frontend/frontendB-desktop-app/template-runtime/src/routes/api/[...path]/+server.js");
    expect(frontendBProxy).toContain("MAPLE_GATEWAY_ORIGIN");
  });

  it("desktop electron shell points at template runtime UI by default", () => {
    const electronMain = read("frontend/frontendB-desktop-app/electron/main.cjs");
    expect(electronMain).toContain("MAPLE_DESKTOP_UI_URL");
    expect(electronMain).toContain("http://127.0.0.1:4102");
    expect(electronMain).toContain("window.loadURL(defaultDesktopUiUrl)");
  });

  it("root command surface uses three-loop defaults", () => {
    const rootPackageJson = read("package.json");
    expect(rootPackageJson).toContain('"dev": "bash backend/backendA-platform-infra/scripts/dev-fast.sh"');
    expect(rootPackageJson).toContain('"start": "bash backend/backendA-platform-infra/scripts/dev-fast.sh"');
    expect(rootPackageJson).toContain('"dev:k8s": "bash backend/backendA-platform-infra/scripts/k8s-local-all.sh"');
    expect(rootPackageJson).toContain('"validate:k8s": "bash scripts/run-k8s-validation.sh"');
    expect(rootPackageJson).toContain('"gate:k8s": "bash scripts/run-k8s-release-gate.sh"');
  });
});
