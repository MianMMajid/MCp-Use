#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, relative, resolve } from "node:path";
import { SERVICE_MESH_TARGETS } from "./service-mesh-manifest.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const force = process.argv.includes("--force");

function listJsFiles(root, prefix = "") {
  const current = prefix ? join(root, prefix) : root;
  const out = [];
  for (const entry of readdirSync(current)) {
    const relPath = prefix ? join(prefix, entry) : entry;
    const absPath = join(root, relPath);
    const info = statSync(absPath);
    if (info.isDirectory()) {
      out.push(...listJsFiles(root, relPath));
      continue;
    }
    if (extname(entry) === ".js") {
      out.push(relPath);
    }
  }
  return out;
}

for (const target of SERVICE_MESH_TARGETS) {
  const serviceDir = join(rootDir, target.servicePath);
  const distDir = join(serviceDir, "dist");
  const srcDir = join(serviceDir, "src");

  if (!existsSync(distDir)) {
    console.warn(`[skip] ${target.name}: missing dist/`);
    continue;
  }

  if (existsSync(srcDir)) {
    if (!force) {
      console.log(`[keep] ${target.name}: src/ already exists`);
      continue;
    }
    rmSync(srcDir, { recursive: true, force: true });
  }
  mkdirSync(srcDir, { recursive: true });

  const jsFiles = listJsFiles(distDir);
  for (const relPath of jsFiles) {
    const from = join(distDir, relPath);
    const to = join(srcDir, relPath);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }

  console.log(
    `[ok] ${target.name}: bootstrapped ${jsFiles.length} files from ${relative(
      rootDir,
      distDir
    )} -> ${relative(rootDir, srcDir)}`
  );
}
