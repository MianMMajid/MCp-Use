import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const REPO_ROOT = process.cwd();

const FRONTEND_SURFACES = {
  frontendA: [resolve(REPO_ROOT, "frontend/frontendA-it-console/template-runtime/src")],
  frontendB: [resolve(REPO_ROOT, "frontend/frontendB-desktop-app/template-runtime/src")],
  frontendC: [
    resolve(REPO_ROOT, "frontend/frontendC-marketing-download-site/template-runtime/src"),
    resolve(REPO_ROOT, "frontend/frontendC-marketing-download-site/template-runtime/next.config.js"),
  ],
  frontendD: [resolve(REPO_ROOT, "frontend/frontendD-mcp-widgets/resources/index.html")],
};

const REQUIRED_SURFACE_ENDPOINTS = {
  frontendA: [
    "/api/runtime/feature-capabilities",
    "/api/openclaw/agent/*",
    "/api/firewall/decision",
    "/admin/api/policies",
    "/admin/api/audit/events",
  ],
  frontendB: [
    "/api/runtime/feature-capabilities",
    "/api/firewall/state",
    "/api/hitl/approvals",
  ],
  frontendC: [
    "/api/:path*",
    "/admin/api/:path*",
  ],
  frontendD: ["/api/runtime/feature-capabilities"],
};

const JOURNEY_ENDPOINTS = [
  "GET /api/openclaw/agent/status",
  "POST /api/openclaw/agent/turn",
  "POST /api/openclaw/agent/longform",
  "GET /api/integrations",
  "POST /api/integrations/:provider/connect",
  "GET /api/hitl/approvals",
  "GET /api/billing/subscription",
  "POST /api/billing/create-checkout-session",
  "POST /api/auth/login",
  "GET /api/org",
  "GET /api/runtime/logs",
  "GET /api/traces",
  "GET /api/tools/registry",
  "GET /api/runtime/feature-capabilities",
];

function collectTextFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const info = statSync(fullPath);
    if (info.isDirectory()) {
      files.push(...collectTextFiles(fullPath));
      continue;
    }
    if (/\.(js|jsx|ts|tsx|mdx|html)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractApiPaths(content) {
  const matches = content.match(/\/(?:admin\/api|api)\/[A-Za-z0-9_*:/-]+/g) ?? [];
  return new Set(matches);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function endpointRegex(method, pathTemplate) {
  const escaped = escapeRegex(pathTemplate).replace(/:([A-Za-z0-9_]+)/g, '[^"\'`/]+');
  return new RegExp(`[A-Za-z_][A-Za-z0-9_\\.]*\\.${method}\\(\\s*["'\`]${escaped}`, "m");
}

test("frontend template surfaces include required API endpoint references", () => {
  for (const [surface, sourcePath] of Object.entries(FRONTEND_SURFACES)) {
    let combinedSource = "";
    for (const entry of sourcePath) {
      if (statSync(entry).isDirectory()) {
        combinedSource +=
          collectTextFiles(entry)
            .map((filePath) => readFileSync(filePath, "utf8"))
            .join("\n") + "\n";
      } else {
        combinedSource += `${readFileSync(entry, "utf8")}\n`;
      }
    }
    const endpoints = extractApiPaths(combinedSource);
    for (const endpoint of REQUIRED_SURFACE_ENDPOINTS[surface]) {
      assert.equal(
        endpoints.has(endpoint),
        true,
        `Missing template-runtime wiring: ${surface} -> ${endpoint}`
      );
    }
  }
});

test("required user journeys resolve to real gateway/business API handlers", () => {
  const gatewayRouteFiles = collectTextFiles(
    resolve(REPO_ROOT, "backend/backendB-core-services/gateway-api/service/src/routes")
  );
  const businessRouteFiles = collectTextFiles(
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
