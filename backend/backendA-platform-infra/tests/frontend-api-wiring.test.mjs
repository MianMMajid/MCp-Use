import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const REPO_ROOT = process.cwd();

const FRONTEND_SURFACES = {
  frontendA: resolve(
    REPO_ROOT,
    "frontend/frontendA-it-console/public/judges.js"
  ),
  frontendB: resolve(
    REPO_ROOT,
    "frontend/frontendB-desktop-app/app/desktop-ui.js"
  ),
  frontendC: resolve(
    REPO_ROOT,
    "frontend/frontendC-marketing-download-site/public/landing.js"
  ),
  frontendD: resolve(
    REPO_ROOT,
    "frontend/frontendD-mcp-widgets/resources/index.html"
  ),
};

const REQUIRED_SURFACE_ENDPOINTS = {
  frontendA: [
    "/api/runtime/feature-capabilities",
    "/api/openclaw/agent/status",
    "/api/openclaw/agent/turn",
    "/api/openclaw/agent/longform",
    "/api/hitl/approvals",
    "/api/billing/subscription",
    "/api/org",
    "/api/runtime/logs",
    "/api/traces",
    "/api/tools/registry",
  ],
  frontendB: ["/api/runtime/feature-capabilities"],
  frontendC: [
    "/api/runtime/feature-capabilities",
    "/api/auth/login",
    "/api/auth/google",
  ],
  frontendD: ["/api/runtime/feature-capabilities"],
};

const JOURNEY_ENDPOINTS = [
  "GET /api/openclaw/agent/status",
  "POST /api/openclaw/agent/turn",
  "POST /api/openclaw/agent/longform",
  "GET /api/hitl/approvals",
  "GET /api/billing/subscription",
  "GET /api/org",
  "GET /api/runtime/logs",
  "GET /api/traces",
  "GET /api/tools/registry",
  "GET /api/runtime/feature-capabilities",
];

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

function extractApiPaths(content) {
  const matches = content.match(/\/api\/[A-Za-z0-9_:/-]+/g) ?? [];
  return new Set(matches);
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

test("frontend endpoint map covers all required user journeys", () => {
  for (const [surface, filePath] of Object.entries(FRONTEND_SURFACES)) {
    const content = readFileSync(filePath, "utf8");
    const endpoints = extractApiPaths(content);
    for (const endpoint of REQUIRED_SURFACE_ENDPOINTS[surface]) {
      assert.equal(
        endpoints.has(endpoint),
        true,
        `Missing frontend wiring: ${surface} -> ${endpoint}`
      );
    }
  }
});

test("required frontend journeys resolve to real gateway/business API handlers", () => {
  const gatewayRouteFiles = collectJsFiles(
    resolve(REPO_ROOT, "backend/backendB-core-services/gateway-api/service/src/routes")
  );
  const businessRouteFiles = collectJsFiles(
    resolve(REPO_ROOT, "backend/backendC-saas-services/business-api/service/src/routes")
  );
  const sources = [...gatewayRouteFiles, ...businessRouteFiles].map((path) =>
    readFileSync(path, "utf8")
  );

  for (const endpoint of JOURNEY_ENDPOINTS) {
    const [method, pathTemplate] = endpoint.split(" ");
    const regex = endpointRegex(method.toLowerCase(), pathTemplate);
    const matched = sources.some((content) => regex.test(content));
    assert.equal(matched, true, `Missing backend handler for ${endpoint}`);
  }
});

