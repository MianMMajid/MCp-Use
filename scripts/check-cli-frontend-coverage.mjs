#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { CLI_SURFACE_MANIFEST } from "../cli/surface-manifest.js";

const repoRoot = process.cwd();
const frontendRoots = [
  "frontend/frontendA-it-console/template-runtime/src",
  "frontend/frontendB-desktop-app/template-runtime/src",
  "frontend/frontendC-marketing-download-site/template-runtime/src",
].map((path) => resolve(repoRoot, path));

const allowedExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".svelte"]);
const ignoredPathPrefixes = ["/api/downloads/"];
const ignoredFileSubstrings = [
  "/routes/api/",
  "/routes/admin/api/",
  ".test.",
  ".spec.",
  "/lib/fake-mode/",
  "/route-registry.js",
  "/proxy.js",
  "/hooks.server.js",
  "/DocsViews.svelte",
  "/MapleShell.svelte",
  "/WorkspaceViewHost.svelte",
];
const manifestPaths = new Set(
  CLI_SURFACE_MANIFEST.flatMap((entry) => [
    ...(entry.frontendPaths || []),
    entry.path || "",
    entry.startPath || "",
    entry.statusPath || "",
  ]).filter(Boolean)
);
const manifestMatchers = [...manifestPaths].map((entry) => ({
  entry,
  regex: new RegExp(`^${escapeRegex(entry).replace(/:[A-Za-z0-9_]+/g, "[^/]+")}$`),
}));

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const filePath = resolve(dir, entry);
    const info = statSync(filePath);
    if (info.isDirectory()) {
      files.push(...collectFiles(filePath));
      continue;
    }
    if (allowedExtensions.has(extname(filePath))) {
      files.push(filePath);
    }
  }
  return files;
}

function normalizePath(rawPath) {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed.startsWith("/")) {
    return "";
  }
  const withoutDecorators = trimmed.split(/\s+->\s+|\s+/)[0];
  const withoutQuery = withoutDecorators.split("?")[0].split("#")[0].replace(/\$\{.*$/g, "");
  const withTemplateParams = withoutQuery
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/:param$/g, "");
  return withTemplateParams.replace(/\/+/g, "/").replace(/\/$/g, "") || "/";
}

function discoverPaths(content) {
  const matches = new Set();
  const regex = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  for (const match of content.matchAll(regex)) {
    const raw = match[2];
    if (!raw.startsWith("/api/") && !raw.startsWith("/admin/api/")) {
      continue;
    }
    const normalized = normalizePath(raw);
    if (!normalized) {
      continue;
    }
    if (ignoredPathPrefixes.some((prefix) => normalized.startsWith(prefix))) {
      continue;
    }
    matches.add(normalized);
  }
  return [...matches];
}

const discovered = [];
for (const root of frontendRoots) {
  if (!existsSync(root)) {
    continue;
  }
  for (const filePath of collectFiles(root)) {
    if (ignoredFileSubstrings.some((segment) => filePath.includes(segment))) {
      continue;
    }
    const content = readFileSync(filePath, "utf8");
    for (const frontendPath of discoverPaths(content)) {
      discovered.push({ filePath, frontendPath });
    }
  }
}

const missing = discovered.filter(({ frontendPath }) =>
  !manifestMatchers.some((matcher) => matcher.regex.test(frontendPath)) &&
  ![...manifestPaths].some((entry) => entry.startsWith(`${frontendPath}/`))
);

if (missing.length > 0) {
  process.stderr.write("[cli-frontend-coverage] Missing CLI manifest coverage:\n");
  for (const item of missing) {
    process.stderr.write(`- ${item.frontendPath} in ${item.filePath}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `[cli-frontend-coverage] OK: ${new Set(discovered.map((item) => item.frontendPath)).size} frontend-backed API paths covered.\n`
);
