import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const REPO_ROOT = process.cwd();
const DESKTOP_UI = resolve(
  REPO_ROOT,
  "frontend/frontendB-desktop-app/app/desktop-ui.js"
);
const DESKTOP_HTML = resolve(
  REPO_ROOT,
  "frontend/frontendB-desktop-app/app/index.html"
);
const GATEWAY_ROUTES_DIR = resolve(
  REPO_ROOT,
  "backend/backendB-core-services/gateway-api/service/src/routes"
);
const BUSINESS_ROUTES_DIR = resolve(
  REPO_ROOT,
  "backend/backendC-saas-services/business-api/service/src/routes"
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
  const escaped = escapeRegex(pathTemplate).replace(
    /:([A-Za-z0-9_]+)/g,
    '[^"\'`/]+'
  );
  return new RegExp(
    `[A-Za-z_][A-Za-z0-9_\\.]*\\.${method}\\(\\s*["'\`]${escaped}`,
    "m"
  );
}

test("desktop journey UI includes all guided step controls", () => {
  const html = readFileSync(DESKTOP_HTML, "utf8");
  const requiredIds = [
    "journeySignInBtn",
    "journeyConnectBtn",
    "journeyRunBtn",
    "journeyHitlBtn",
    "journeyBillingBtn",
    "journeyRunAllBtn",
    "journeyProvider",
    "journeyIntegrationCredential",
    "journeyOut",
  ];
  for (const id of requiredIds) {
    assert.equal(
      html.includes(`id="${id}"`),
      true,
      `Missing desktop journey control: ${id}`
    );
  }
});

test("desktop journey wiring references required user-journey APIs", () => {
  const source = readFileSync(DESKTOP_UI, "utf8");
  const requiredPaths = [
    "/api/auth/login",
    "/api/integrations",
    "/api/integrations/:provider/connect",
    "/api/openclaw/agent/turn",
    "/api/hitl/approvals",
    "/api/hitl/approvals/decision",
    "/api/billing/create-checkout-session",
  ];
  for (const path of requiredPaths) {
    assert.equal(source.includes(path), true, `Desktop journey missing path: ${path}`);
  }
  assert.equal(
    source.includes("runFullJourney"),
    true,
    "Desktop journey missing full-run orchestrator."
  );
});

test("backend route handlers exist for desktop journey flow", () => {
  const gatewaySources = collectJsFiles(GATEWAY_ROUTES_DIR).map((filePath) =>
    readFileSync(filePath, "utf8")
  );
  const businessSources = collectJsFiles(BUSINESS_ROUTES_DIR).map((filePath) =>
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

  const businessEndpoints = [
    "GET /api/business/integrations",
    "POST /api/business/integrations/:provider/connect",
    "POST /api/business/integrations/:provider/disconnect",
  ];
  for (const endpoint of businessEndpoints) {
    const [method, pathTemplate] = endpoint.split(" ");
    const regex = endpointRegex(method.toLowerCase(), pathTemplate);
    const matched = businessSources.some((content) => regex.test(content));
    assert.equal(matched, true, `Missing business endpoint: ${endpoint}`);
  }
});
