import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const REPO_ROOT = process.cwd();
// Desktop app migrated from React/JSX to SvelteKit. The main workspace
// is now the SvelteKit page at src/routes/+page.svelte.
const DESKTOP_WORKSPACE = resolve(
  REPO_ROOT,
  "frontend/frontendB-desktop-app/template-runtime/src/routes/+page.svelte"
);
const ELECTRON_MAIN = resolve(
  REPO_ROOT,
  "frontend/frontendB-desktop-app/electron/main.cjs"
);
const GATEWAY_ROUTES_DIR = resolve(
  REPO_ROOT,
  "backend/backendB-core-services/gateway-api/service/src/routes"
);
function collectJsFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const info = statSync(fullPath);
    if (info.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
      continue;
    }
    if (entry.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function endpointRegex(method, pathTemplate) {
  const escaped = escapeRegex(pathTemplate).replace(/:([A-Za-z0-9_]+)/g, '[^"\'`/]+');
  return new RegExp(`[A-Za-z_][A-Za-z0-9_\\.]*\\.${method}\\(\\s*["'\`]${escaped}`, "m");
}

test("desktop template workspace includes core journey views and endpoints", () => {
  // SvelteKit architecture: +page.svelte is a thin shell that imports
  // AppShell and ChatWorkspace components. Verify the component composition
  // exists rather than checking for inline string literals.
  const source = readFileSync(DESKTOP_WORKSPACE, "utf8");
  const requiredImports = [
    "AppShell",
    "ChatWorkspace",
  ];
  for (const value of requiredImports) {
    assert.equal(source.includes(value), true, `Desktop workspace missing component: ${value}`);
  }
  // Verify the gateway routes directory still contains the endpoints
  // that the desktop journey depends on.
  const gatewaySource = collectJsFiles(GATEWAY_ROUTES_DIR)
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
  const requiredEndpoints = [
    "/api/runtime/feature-capabilities",
    "/api/firewall/state",
    "/api/hitl/approvals",
  ];
  for (const ep of requiredEndpoints) {
    assert.ok(gatewaySource.includes(ep), `Gateway missing journey endpoint: ${ep}`);
  }
});

test("desktop electron shell targets template runtime URL", () => {
  const source = readFileSync(ELECTRON_MAIN, "utf8");
  assert.equal(source.includes("MAPLE_DESKTOP_UI_URL"), true, "Missing MAPLE_DESKTOP_UI_URL support.");
  assert.equal(source.includes("http://127.0.0.1:4102"), true, "Missing template runtime default URL.");
  assert.equal(source.includes("window.loadURL(defaultDesktopUiUrl)"), true, "Desktop shell is not loading template runtime.");
});

test("backend route handlers exist for desktop journey flow", () => {
  const gatewaySources = collectJsFiles(GATEWAY_ROUTES_DIR).map((filePath) =>
    readFileSync(filePath, "utf8")
  );

  const gatewayEndpoints = [
    "POST /api/auth/login",
    "GET /api/integrations",
    "POST /api/integrations/:provider/connect",
    "POST /api/openclaw/agent/turn",
    "GET /api/hitl/approvals",
    "POST /api/hitl/approvals/decision",
    "POST /api/billing/create-checkout-session",
  ];
  for (const endpoint of gatewayEndpoints) {
    const [method, pathTemplate] = endpoint.split(" ");
    const regex = endpointRegex(method.toLowerCase(), pathTemplate);
    const matched = gatewaySources.some((content) => regex.test(content));
    assert.equal(matched, true, `Missing gateway endpoint: ${endpoint}`);
  }
});
