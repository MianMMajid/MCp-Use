#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICE_MESH_TARGETS } from "../backend/backendA-platform-infra/scripts/service-mesh-manifest.mjs";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));

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

const serviceTests = SERVICE_MESH_TARGETS.flatMap((target) =>
  listTests(resolve(ROOT_DIR, target.servicePath, "tests")),
);

if (serviceTests.length === 0) {
  process.stderr.write("[mesh-tests] No mesh service tests discovered.\n");
  process.exit(1);
}

const run = spawnSync(process.execPath, ["--test", ...serviceTests], {
  cwd: ROOT_DIR,
  stdio: "inherit",
  env: process.env,
});

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

process.stdout.write(`[mesh-tests] Passed (${serviceTests.length} files).\n`);
