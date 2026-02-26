#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "../../../..");
const templatePath = resolve(__dirname, "template.backend-mesh.json");
const argsPath = resolve(__dirname, "northflank.arguments.json");
const oneClickPath = resolve(__dirname, "template.backend-mesh.one-click.json");
const certPath = resolve(__dirname, "certs", "tls.crt");
const keyPath = resolve(__dirname, "certs", "tls.key");
const caPath = resolve(__dirname, "certs", "ca.crt");

function run(command) {
  execSync(command, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
}

function loadJson(pathname) {
  return JSON.parse(readFileSync(pathname, "utf8"));
}

console.log("[northflank] Rendering base template...");
run("node backend/backendA-platform-infra/deploy/northflank/render-template.mjs");

if (!existsSync(certPath) || !existsSync(keyPath) || !existsSync(caPath)) {
  console.log("[northflank] TLS cert bundle not found; generating...");
  run("bash backend/backendA-platform-infra/deploy/northflank/generate-northflank-tls.sh");
}

console.log("[northflank] Building argument payload from repo/env/certs...");
run("node backend/backendA-platform-infra/deploy/northflank/generate-args.mjs");

const template = loadJson(templatePath);
const args = loadJson(argsPath);

template.arguments = {
  ...(template.arguments || {}),
  ...(args.arguments || {}),
};

writeFileSync(oneClickPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");

console.log(`[northflank] Wrote one-click template: ${oneClickPath}`);
console.log("[northflank] Import this file in Northflank and run.");
