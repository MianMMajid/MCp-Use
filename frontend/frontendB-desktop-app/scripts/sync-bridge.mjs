#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const sourceDir = resolve(repoRoot, "backend/backendC-desktop-runtime-bridge/bridge");
const targetDir = resolve(repoRoot, "frontend/frontendB-desktop-app/bridge-runtime");

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });

console.log(`[desktop-sync] copied runtime bridge -> ${targetDir}`);
