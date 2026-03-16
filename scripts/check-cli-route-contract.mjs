#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { CLI_SURFACE_MANIFEST } from "../cli/surface-manifest.js";

function collectJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const filePath = resolve(dir, entry);
    const info = statSync(filePath);
    if (info.isDirectory()) {
      files.push(...collectJsFiles(filePath));
      continue;
    }
    if (filePath.endsWith(".js")) {
      files.push(filePath);
    }
  }
  return files;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function endpointRegex(endpoint) {
  const [method, routePath] = endpoint.split(" ");
  const escapedPath = escapeRegex(routePath).replace(/:([A-Za-z0-9_]+)/g, "[^\"'`/]+");
  return new RegExp(`\\.${method.toLowerCase()}\\(\\s*["'\`]${escapedPath}`, "m");
}

const repoRoot = process.cwd();
const routeDir = resolve(repoRoot, "backend/backendB-core-services/gateway-api/service/src/routes");
const sources = collectJsFiles(routeDir).map((filePath) => ({
  filePath,
  content: readFileSync(filePath, "utf8"),
}));
const allEndpoints = [...new Set(CLI_SURFACE_MANIFEST.flatMap((entry) => entry.backendRoutes || []))];
const missing = allEndpoints.filter((endpoint) =>
  !sources.some((source) => endpointRegex(endpoint).test(source.content))
);

if (missing.length > 0) {
  process.stderr.write("[cli-route-contract] Missing backend routes referenced by CLI surface:\n");
  for (const endpoint of missing) {
    process.stderr.write(`- ${endpoint}\n`);
  }
  process.exit(1);
}

process.stdout.write(`[cli-route-contract] OK: ${allEndpoints.length} backend routes matched.\n`);
