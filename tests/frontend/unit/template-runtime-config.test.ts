import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("template runtime config wiring", () => {
  it("frontend A/B expose Svelte proxy handlers and frontend C keeps next rewrite contracts", () => {
    const frontendAApiProxy = read("frontend/frontendA-it-console/template-runtime/src/routes/api/[...path]/+server.js");
    const frontendAAdminProxy = read("frontend/frontendA-it-console/template-runtime/src/routes/admin/api/[...path]/+server.js");
    const frontendAHooks = read("frontend/frontendA-it-console/template-runtime/src/hooks.server.js");
    const frontendCNextConfig = read("frontend/frontendC-marketing-download-site/template-runtime/next.config.js");
    const frontendBApiProxy = read("frontend/frontendB-desktop-app/template-runtime/src/routes/api/[...path]/+server.js");
    const frontendBAdminProxy = read("frontend/frontendB-desktop-app/template-runtime/src/routes/admin/api/[...path]/+server.js");
    const frontendBHooks = read("frontend/frontendB-desktop-app/template-runtime/src/hooks.server.js");

    for (const source of [frontendCNextConfig]) {
      expect(source).toContain("source: '/api/:path*'");
      expect(source).toContain("destination: `${mapleGatewayOrigin}/api/:path*`");
      expect(source).toContain("source: '/admin/api/:path*'");
      expect(source).toContain("destination: `${mapleAdminConsoleOrigin}/admin/api/:path*`");
    }

    expect(frontendAApiProxy).toContain("`${getGatewayOrigin()}/api/${joined}${url.search}`");
    expect(frontendAAdminProxy).toContain("`${getAdminOrigin()}/admin/api/${joined}${url.search}`");
    expect(frontendAHooks).toContain("if (!pathname.startsWith('/maple'))");

    expect(frontendBApiProxy).toContain("new URL(`/api/${path}`");
    expect(frontendBAdminProxy).toContain("new URL(`/admin/api/${path}`");
    expect(frontendBHooks).toContain("pathname === '/runs'");
    expect(frontendBHooks).toContain("pathname.match(/^\\/runs\\/([^/]+)$/)");
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
