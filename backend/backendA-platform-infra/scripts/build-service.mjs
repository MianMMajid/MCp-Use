#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const servicePathArg = process.argv[2];

if (!servicePathArg) {
  console.error("Usage: node backend/backendA-platform-infra/scripts/build-service.mjs <service/path>");
  process.exit(1);
}

const serviceDir = resolve(rootDir, servicePathArg);
const srcDir = join(serviceDir, "src");
const distDir = join(serviceDir, "dist");

if (!existsSync(srcDir)) {
  console.error(`Source directory missing: ${relative(rootDir, srcDir)}`);
  process.exit(1);
}

function copyTree(sourceRoot, targetRoot, prefix = "") {
  const current = prefix ? join(sourceRoot, prefix) : sourceRoot;
  for (const entry of readdirSync(current)) {
    const relPath = prefix ? join(prefix, entry) : entry;
    const absPath = join(sourceRoot, relPath);
    const info = statSync(absPath);
    if (info.isDirectory()) {
      copyTree(sourceRoot, targetRoot, relPath);
      continue;
    }
    if (extname(entry) !== ".js") {
      continue;
    }
    const outPath = join(targetRoot, relPath);
    mkdirSync(dirname(outPath), { recursive: true });
    cpSync(absPath, outPath);
  }
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
copyTree(srcDir, distDir);

console.log(
  `[build] ${relative(rootDir, serviceDir)}: ${relative(rootDir, srcDir)} -> ${relative(
    rootDir,
    distDir
  )}`
);
