#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const rootDir = path.resolve(scriptDir, "../../..");
const canonicalRoot = path.resolve(rootDir, "backend/proto");
const mirrorRoots = [
  path.resolve(rootDir, "backend/backendB-core-services/proto"),
  path.resolve(rootDir, "backend/backendB-core-services/contracts/proto"),
];

function toWorkspacePath(absolutePath) {
  return path.relative(rootDir, absolutePath);
}

function isIgnoredEntry(name) {
  return name.startsWith(".");
}

async function assertDirectoryExists(directoryPath) {
  const stats = await fs.stat(directoryPath).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Missing directory: ${toWorkspacePath(directoryPath)}`);
  }
}

async function listProtoFiles(rootDirPath, prefix = "") {
  const currentPath = prefix ? path.join(rootDirPath, prefix) : rootDirPath;
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (isIgnoredEntry(entry.name)) {
      continue;
    }
    const relPath = prefix ? path.join(prefix, entry.name) : entry.name;
    const absPath = path.join(rootDirPath, relPath);
    if (entry.isDirectory()) {
      files.push(...(await listProtoFiles(rootDirPath, relPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".proto")) {
      files.push(relPath);
    }
  }

  return files.sort();
}

async function loadProtoHashes(rootDirPath) {
  await assertDirectoryExists(rootDirPath);
  const files = await listProtoFiles(rootDirPath);
  const map = new Map();
  for (const relPath of files) {
    const raw = await fs.readFile(path.join(rootDirPath, relPath));
    const digest = createHash("sha256").update(raw).digest("hex");
    map.set(relPath, digest);
  }
  return map;
}

function diffPaths(canonicalPaths, targetPaths) {
  const missing = canonicalPaths.filter((file) => !targetPaths.includes(file));
  const extra = targetPaths.filter((file) => !canonicalPaths.includes(file));
  return { missing, extra };
}

async function main() {
  const canonicalMap = await loadProtoHashes(canonicalRoot);
  const canonicalPaths = [...canonicalMap.keys()];
  let hasFailure = false;

  for (const mirrorRoot of mirrorRoots) {
    let mirrorHasFailure = false;
    const mirrorMap = await loadProtoHashes(mirrorRoot);
    const mirrorPaths = [...mirrorMap.keys()];
    const { missing, extra } = diffPaths(canonicalPaths, mirrorPaths);

    if (missing.length > 0) {
      hasFailure = true;
      mirrorHasFailure = true;
      for (const file of missing) {
        console.error(
          `[proto-sync] missing in ${toWorkspacePath(mirrorRoot)}: ${file}`
        );
      }
    }

    if (extra.length > 0) {
      hasFailure = true;
      mirrorHasFailure = true;
      for (const file of extra) {
        console.error(
          `[proto-sync] extra in ${toWorkspacePath(mirrorRoot)}: ${file}`
        );
      }
    }

    for (const file of canonicalPaths) {
      if (!mirrorMap.has(file)) {
        continue;
      }
      if (mirrorMap.get(file) !== canonicalMap.get(file)) {
        hasFailure = true;
        mirrorHasFailure = true;
        console.error(
          `[proto-sync] content mismatch for ${file}: canonical=${toWorkspacePath(
            canonicalRoot
          )} mirror=${toWorkspacePath(mirrorRoot)}`
        );
      }
    }

    if (!mirrorHasFailure) {
      console.log(
        `[ok] proto sync: ${toWorkspacePath(mirrorRoot)} (${mirrorPaths.length} files)`
      );
    }
  }

  if (hasFailure) {
    console.error("Proto mirrors are out of sync. Run: npm run contracts:generate");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
