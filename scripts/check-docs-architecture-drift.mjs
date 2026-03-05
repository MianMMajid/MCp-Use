#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readServiceCatalog } from "./service-audit-common.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = resolve(ROOT_DIR, "artifacts/debt");
const REPORT_FILE = resolve(ARTIFACT_DIR, "docs-architecture-drift.json");

const packageJson = JSON.parse(readFileSync(resolve(ROOT_DIR, "package.json"), "utf8"));
const scriptSet = new Set(Object.keys(packageJson.scripts ?? {}));
const targetDocs = [
  resolve(ROOT_DIR, "README.md"),
  ...readdirSync(resolve(ROOT_DIR, "docs"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => resolve(ROOT_DIR, "docs", name)),
];

const removedAliasPatterns = [
  /npm\s+run\s+dev:frontendA:template/g,
  /npm\s+run\s+dev:frontendB:template/g,
  /npm\s+run\s+dev:frontendC:template/g,
  /npm\s+run\s+build:frontendA:template/g,
  /npm\s+run\s+build:frontendB:template/g,
  /npm\s+run\s+build:frontendC:template/g,
];

function extractCommands(content) {
  const commands = new Set();
  const regex = /npm\s+run\s+([a-zA-Z0-9:_-]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    commands.add(match[1]);
  }
  return [...commands];
}

function extractBashScripts(content) {
  const scripts = new Set();
  const regex = /bash\s+(scripts\/[a-zA-Z0-9._/-]+\.sh)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    scripts.add(match[1]);
  }
  return [...scripts];
}

function extractPathsFromSection(content, sectionStart, sectionEnd) {
  const startIndex = content.indexOf(sectionStart);
  if (startIndex < 0) return [];
  const endIndex = sectionEnd ? content.indexOf(sectionEnd, startIndex + sectionStart.length) : -1;
  const section = endIndex >= 0 ? content.slice(startIndex, endIndex) : content.slice(startIndex);
  const paths = [];
  const regex = /`([^`]+)`/g;
  let match;
  while ((match = regex.exec(section)) !== null) {
    const value = String(match[1]).trim();
    if (value.startsWith("backend/")) {
      paths.push(value);
    }
  }
  return [...new Set(paths)];
}

function servicePathsFromCatalog() {
  const catalog = readServiceCatalog(resolve(ROOT_DIR, "service-catalog.yaml"));
  const active = [];
  const archived = [];
  for (const row of catalog.services ?? []) {
    const service = String(row?.service ?? "").trim();
    if (!service) continue;
    const lifecycle = String(row?.lifecycle ?? "active").trim().toLowerCase();
    const archiveStatus = String(row?.archiveStatus ?? (lifecycle === "retired" ? "archived" : "active")).trim().toLowerCase();
    if (archiveStatus === "archived") {
      const archivePath = String(row?.archivePath ?? "").trim();
      if (archivePath) archived.push(archivePath);
      continue;
    }
    active.push(`backend/backendB-core-services/${service}`);
  }
  return { active: [...new Set(active)], archived: [...new Set(archived)] };
}

function diff(source, target) {
  return source.filter((item) => !target.includes(item)).sort();
}

function main() {
  const violations = [];
  const files = [];

  for (const file of targetDocs) {
    const content = readFileSync(file, "utf8");
    const commands = extractCommands(content);
    const bashScripts = extractBashScripts(content);

    for (const command of commands) {
      if (!scriptSet.has(command)) {
        violations.push(`${file.replace(`${ROOT_DIR}/`, "")}: references missing npm script "${command}".`);
      }
    }

    for (const scriptRel of bashScripts) {
      const abs = resolve(ROOT_DIR, scriptRel);
      if (!existsSync(abs)) {
        violations.push(`${file.replace(`${ROOT_DIR}/`, "")}: references missing shell script "${scriptRel}".`);
      }
    }

    for (const pattern of removedAliasPatterns) {
      if (pattern.test(content)) {
        violations.push(`${file.replace(`${ROOT_DIR}/`, "")}: contains removed alias reference matching ${pattern}.`);
      }
    }

    files.push({
      file: file.replace(`${ROOT_DIR}/`, ""),
      commandRefs: commands,
      bashScriptRefs: bashScripts,
    });
  }

  const docsTopologyFile = resolve(ROOT_DIR, "docs/repo-topology.md");
  const docsTopologyContent = readFileSync(docsTopologyFile, "utf8");
  const docActivePaths = extractPathsFromSection(
    docsTopologyContent,
    "## Active Runtime Tree",
    "## Archived Runtime Tree",
  );
  const docArchivedPaths = extractPathsFromSection(
    docsTopologyContent,
    "## Archived Runtime Tree",
    "## Source-of-Truth Topology Contracts",
  );

  const expected = servicePathsFromCatalog();
  const expectedActiveServicePaths = expected.active;
  const expectedArchivedServicePaths = expected.archived;

  const missingActive = diff(expectedActiveServicePaths, docActivePaths);
  const extraActive = diff(docActivePaths.filter((p) => p.startsWith("backend/backendB-core-services/") || p.startsWith("backend/backendC-saas-services/")), expectedActiveServicePaths);
  const missingArchived = diff(expectedArchivedServicePaths, docArchivedPaths);
  const extraArchived = diff(docArchivedPaths.filter((p) => p.startsWith("backend/legacy/retired-services/")), expectedArchivedServicePaths);

  if (missingActive.length > 0) {
    violations.push(`docs/repo-topology.md: missing active service paths -> ${missingActive.join(", ")}`);
  }
  if (extraActive.length > 0) {
    violations.push(`docs/repo-topology.md: extra active service paths -> ${extraActive.join(", ")}`);
  }
  if (missingArchived.length > 0) {
    violations.push(`docs/repo-topology.md: missing archived service paths -> ${missingArchived.join(", ")}`);
  }
  if (extraArchived.length > 0) {
    violations.push(`docs/repo-topology.md: extra archived service paths -> ${extraArchived.join(", ")}`);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const report = {
    artifactSchemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ok: violations.length === 0,
    files,
    topology: {
      expectedActiveServicePaths,
      documentedActivePaths: docActivePaths,
      expectedArchivedServicePaths,
      documentedArchivedPaths: docArchivedPaths,
    },
    violations,
  };

  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  if (violations.length > 0) {
    process.stderr.write("[docs-drift] violations found:\n");
    for (const violation of violations) {
      process.stderr.write(`- ${violation}\n`);
    }
    process.stderr.write(`[docs-drift] Report: ${REPORT_FILE}\n`);
    process.exit(1);
  }

  process.stdout.write(`[docs-drift] OK. Report: ${REPORT_FILE}\n`);
}

main();
