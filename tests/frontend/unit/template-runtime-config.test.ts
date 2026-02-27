import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("template runtime config wiring", () => {
  it("all template runtimes rewrite /api and /admin/api through gateway", () => {
    const frontendANextConfig = read("frontend/frontendA-it-console/template-runtime/next.config.mjs");
    const frontendBNextConfig = read("frontend/frontendB-desktop-app/template-runtime/next.config.mjs");
    const frontendCNextConfig = read("frontend/frontendC-marketing-download-site/template-runtime/next.config.js");

    for (const source of [frontendANextConfig, frontendBNextConfig, frontendCNextConfig]) {
      expect(source).toContain("source: '/api/:path*'");
      expect(source).toContain("destination: `${mapleGatewayOrigin}/api/:path*`");
      expect(source).toContain("source: '/admin/api/:path*'");
      expect(source).toContain("destination: `${mapleGatewayOrigin}/admin/api/:path*`");
    }
  });

  it("desktop electron shell points at template runtime UI by default", () => {
    const electronMain = read("frontend/frontendB-desktop-app/electron/main.cjs");
    expect(electronMain).toContain("MAPLE_DESKTOP_UI_URL");
    expect(electronMain).toContain("http://127.0.0.1:4102");
    expect(electronMain).toContain("window.loadURL(defaultDesktopUiUrl)");
  });

  it("root dev scripts default to template runtimes for A/B/C", () => {
    const rootPackageJson = read("package.json");
    expect(rootPackageJson).toContain('"dev:frontendA": "npm --prefix frontend/frontendA-it-console/template-runtime run dev -- --port 4101"');
    expect(rootPackageJson).toContain('"dev:frontendB": "npm --prefix frontend/frontendB-desktop-app/template-runtime run dev -- --port 4102"');
    expect(rootPackageJson).toContain('"dev:frontendC": "npm --prefix frontend/frontendC-marketing-download-site/template-runtime run dev -- --port 4103"');
  });
});
