#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICE_MESH_SERVICES, SERVICE_ROOT } from "./service-mesh-manifest.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const buildScript = join(rootDir, "backend/backendA-platform-infra/scripts/build-service.mjs");

for (const serviceName of SERVICE_MESH_SERVICES) {
  const servicePath = `${SERVICE_ROOT}/${serviceName}/service`;
  const run = spawnSync(process.execPath, [buildScript, servicePath], {
    cwd: rootDir,
    stdio: "inherit",
  });
  if (run.status !== 0) {
    process.exit(run.status ?? 1);
  }
}

console.log(`[build] completed ${SERVICE_MESH_SERVICES.length} service builds`);
