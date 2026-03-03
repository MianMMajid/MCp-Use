#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const RETIRED_ROOT = resolve(ROOT_DIR, "backend/legacy/retired-services");

function listTests(dirPath) {
  if (!existsSync(dirPath)) return [];
  const tests = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      const info = statSync(fullPath);
      if (info.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.endsWith(".test.mjs")) {
        tests.push(fullPath);
      }
    }
  }
  return tests.sort();
}

if (!existsSync(RETIRED_ROOT)) {
  process.stdout.write("[retired-tests] No archived services found.\n");
  process.exit(0);
}

const retiredTests = [];
for (const serviceName of readdirSync(RETIRED_ROOT)) {
  const testsDir = resolve(RETIRED_ROOT, serviceName, "service/tests");
  retiredTests.push(...listTests(testsDir));
}

if (retiredTests.length === 0) {
  process.stdout.write("[retired-tests] No archived service tests discovered.\n");
  process.exit(0);
}

const run = spawnSync(process.execPath, ["--test", ...retiredTests], {
  cwd: ROOT_DIR,
  stdio: "inherit",
  env: process.env,
});

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

process.stdout.write(`[retired-tests] Passed (${retiredTests.length} files).\n`);
