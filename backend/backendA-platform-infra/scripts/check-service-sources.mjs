#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICE_MESH_SERVICES, SERVICE_ROOT } from "./service-mesh-manifest.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const onlyService = process.argv[2]?.trim();
const SHARED_SOURCE_PACKAGES = [
  "maple-common",
  "maple-persistence",
  "maple-security",
];

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
    if (entry.endsWith(".js")) {
      out.push(absPath);
    }
  }
  return out;
}

function isSuspiciousDuplicateArtifact(pathname) {
  return /\s+\d+\.js$/i.test(basename(pathname));
}

function validateSourceBackedPackage(packageName) {
  const packageDir = join(
    rootDir,
    "backend/backendB-core-services/shared/packages",
    packageName
  );
  const srcDir = join(packageDir, "src");
  const distDir = join(packageDir, "dist");
  const srcIndexPath = join(srcDir, "index.js");

  if (!existsSync(srcDir)) {
    console.error(`[missing] ${packageName}: ${srcDir}`);
    process.exit(1);
  }
  if (!existsSync(srcIndexPath)) {
    console.error(`[missing] ${packageName}: src/index.js`);
    process.exit(1);
  }
  if (!existsSync(distDir)) {
    console.error(`[missing] ${packageName}: ${distDir}`);
    process.exit(1);
  }

  const srcJsFiles = listJsFiles(srcDir);
  const srcRelPaths = new Set(srcJsFiles.map((file) => relative(srcDir, file)));
  const distJsFiles = listJsFiles(distDir);
  const distRelPaths = new Set(distJsFiles.map((file) => relative(distDir, file)));

  for (const srcFile of srcJsFiles) {
    const syntaxCheck = spawnSync(process.execPath, ["--check", srcFile], {
      cwd: rootDir,
      stdio: "pipe",
      encoding: "utf8",
    });
    if (syntaxCheck.status !== 0) {
      console.error(`[syntax] ${packageName}: ${srcFile}`);
      process.stderr.write(syntaxCheck.stderr || "");
      process.exit(syntaxCheck.status ?? 1);
    }

    const relPath = relative(srcDir, srcFile);
    if (!distRelPaths.has(relPath)) {
      console.error(
        `[artifact] ${packageName}: src file missing in dist ${relative(
          rootDir,
          srcFile
        )}`
      );
      process.exit(1);
    }
  }

  for (const distFile of distJsFiles) {
    if (isSuspiciousDuplicateArtifact(distFile)) {
      console.error(
        `[artifact] ${packageName}: suspicious duplicate dist artifact ${relative(
          rootDir,
          distFile
        )}`
      );
      process.exit(1);
    }
    const relPath = relative(distDir, distFile);
    if (!srcRelPaths.has(relPath)) {
      console.error(
        `[artifact] ${packageName}: dist file has no matching src file ${relative(
          rootDir,
          distFile
        )}`
      );
      process.exit(1);
    }
  }

  console.log(`[ok] ${packageName}: ${srcJsFiles.length} JS source files validated`);
}

for (const serviceName of SERVICE_MESH_SERVICES) {
  if (onlyService && serviceName !== onlyService) {
    continue;
  }
  const serviceDir = join(rootDir, SERVICE_ROOT, serviceName, "service");
  const srcDir = join(serviceDir, "src");
  const distDir = join(serviceDir, "dist");
  if (!existsSync(srcDir)) {
    console.error(`[missing] ${serviceName}: ${srcDir}`);
    process.exit(1);
  }
  const mainPath = join(srcDir, "main.js");
  if (!existsSync(mainPath)) {
    console.error(`[missing] ${serviceName}: src/main.js`);
    process.exit(1);
  }

  const jsFiles = listJsFiles(srcDir);
  const srcRelPaths = new Set(jsFiles.map((file) => relative(srcDir, file)));
  for (const jsFile of jsFiles) {
    const syntaxCheck = spawnSync(process.execPath, ["--check", jsFile], {
      cwd: rootDir,
      stdio: "pipe",
      encoding: "utf8",
    });
    if (syntaxCheck.status !== 0) {
      console.error(`[syntax] ${serviceName}: ${jsFile}`);
      process.stderr.write(syntaxCheck.stderr || "");
      process.exit(syntaxCheck.status ?? 1);
    }
  }

  if (existsSync(distDir)) {
    const distJsFiles = listJsFiles(distDir);
    const distRelPaths = new Set(distJsFiles.map((file) => relative(distDir, file)));

    for (const distFile of distJsFiles) {
      if (isSuspiciousDuplicateArtifact(distFile)) {
        console.error(
          `[artifact] ${serviceName}: suspicious duplicate dist artifact ${relative(
            rootDir,
            distFile
          )}`
        );
        console.error(
          `Run 'npm run mesh:build' to regenerate dist from src and remove stale duplicates.`
        );
        process.exit(1);
      }
      const relPath = relative(distDir, distFile);
      if (!srcRelPaths.has(relPath)) {
        console.error(
          `[artifact] ${serviceName}: dist file has no matching src file ${relative(
            rootDir,
            distFile
          )}`
        );
        console.error(
          `Run 'npm run mesh:build' to realign dist output with the source tree.`
        );
        process.exit(1);
      }
    }

    for (const srcFile of jsFiles) {
      const relPath = relative(srcDir, srcFile);
      if (!distRelPaths.has(relPath)) {
        console.error(
          `[artifact] ${serviceName}: src file missing in dist ${relative(rootDir, srcFile)}`
        );
        console.error(
          `Run 'npm run mesh:build' to regenerate dist output for all services.`
        );
        process.exit(1);
      }
    }
  }

  console.log(`[ok] ${serviceName}: ${jsFiles.length} JS source files validated`);
}

if (onlyService && !SERVICE_MESH_SERVICES.includes(onlyService)) {
  console.error(
    `Unknown service '${onlyService}'. Expected one of: ${SERVICE_MESH_SERVICES.join(", ")}`
  );
  process.exit(1);
}

for (const packageName of SHARED_SOURCE_PACKAGES) {
  validateSourceBackedPackage(packageName);
}
