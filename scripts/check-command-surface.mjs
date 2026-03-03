#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJsonPath = resolve(rootDir, "package.json");
const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const scripts = pkg.scripts ?? {};
const scriptNames = Object.keys(scripts);
const maxScripts = Number(process.env.MAPLE_MAX_ROOT_SCRIPTS ?? 60);

const violations = [];
if (!Number.isFinite(maxScripts) || maxScripts <= 0) {
  violations.push(`MAPLE_MAX_ROOT_SCRIPTS must be a positive integer (received: ${process.env.MAPLE_MAX_ROOT_SCRIPTS}).`);
}
if (scriptNames.length > maxScripts) {
  violations.push(`Root script surface too large: ${scriptNames.length} > ${maxScripts}.`);
}

if (violations.length > 0) {
  process.stderr.write("[command-surface] violations found:\n");
  for (const violation of violations) {
    process.stderr.write(`- ${violation}\n`);
  }
  process.exit(1);
}

process.stdout.write(`[command-surface] OK: ${scriptNames.length} scripts (limit ${maxScripts}).\n`);
