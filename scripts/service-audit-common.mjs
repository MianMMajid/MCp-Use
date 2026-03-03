import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml, loadAll as loadAllYaml } from "js-yaml";
import { SERVICE_MESH_TARGETS } from "../backend/backendA-platform-infra/scripts/service-mesh-manifest.mjs";

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_AUDIT_DIR = resolve(ROOT_DIR, "artifacts/service-audit");
export const DEFAULT_INVENTORY_FILE = resolve(DEFAULT_AUDIT_DIR, "service-inventory.json");
export const DEFAULT_CALLGRAPH_FILE = resolve(DEFAULT_AUDIT_DIR, "static-callgraph.json");
export const DEFAULT_REPORT_JSON_FILE = resolve(DEFAULT_AUDIT_DIR, "utilization-report.json");
export const DEFAULT_REPORT_MD_FILE = resolve(DEFAULT_AUDIT_DIR, "utilization-report.md");
export const DEFAULT_RUNTIME_EVENTS_FILE = resolve(
  DEFAULT_AUDIT_DIR,
  "service-utilization-events.ndjson",
);
export const DEFAULT_SERVICE_CATALOG_FILE = resolve(ROOT_DIR, "service-catalog.yaml");

export function nowIso() {
  return new Date().toISOString();
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] ?? "");
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !String(next).startsWith("--")) {
      options.set(key, String(next));
      i += 1;
      continue;
    }
    options.set(key, "true");
  }
  return options;
}

export function ensureDirForFile(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function writeJson(filePath, value) {
  ensureDirForFile(filePath);
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function readJsonIfExists(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function readServiceCatalog(catalogFile = DEFAULT_SERVICE_CATALOG_FILE) {
  if (!existsSync(catalogFile)) {
    throw new Error(`Missing service catalog: ${catalogFile}`);
  }
  const parsed = loadYaml(readFileSync(catalogFile, "utf8")) ?? {};
  const rows = Array.isArray(parsed.services) ? parsed.services : [];
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const service = String(row.service ?? "").trim();
    if (!service) continue;
    map.set(service, row);
  }
  return {
    version: Number(parsed.version ?? 1),
    zeroUseWindowDays: Number(parsed.zeroUseWindowDays ?? 14),
    services: rows,
    byService: map,
  };
}

export function readK8sDeployments(
  deploymentFile = resolve(ROOT_DIR, "backend/backendA-platform-infra/k8s/deployment.yaml"),
) {
  if (!existsSync(deploymentFile)) return [];
  const docs = [];
  loadAllYaml(readFileSync(deploymentFile, "utf8"), (doc) => {
    if (doc) docs.push(doc);
  });
  const names = [];
  for (const doc of docs) {
    if (doc?.kind !== "Deployment") continue;
    const name = String(doc?.metadata?.name ?? "").trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

export function readRailwayServices(
  railwayFile = resolve(ROOT_DIR, "backend/backendA-platform-infra/deploy/railway-entrypoint.sh"),
) {
  if (!existsSync(railwayFile)) return [];
  const content = readFileSync(railwayFile, "utf8");
  const services = [];
  const regex = /^\s{2}([a-zA-Z0-9-]+)\)\s*$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    services.push(match[1]);
  }
  return [...new Set(services)];
}

export function readRailwayDeployHelperServices(
  deployFile = resolve(ROOT_DIR, "deploy-all-railway.sh"),
) {
  if (!existsSync(deployFile)) return [];
  const content = readFileSync(deployFile, "utf8");
  const services = [];
  const regex = /deploy_service\s+"[^"]+"\s+"([^"]+)"/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    services.push(String(match[1]).trim());
  }
  return [...new Set(services.filter(Boolean))];
}

export function readNorthflankTemplateServices(
  northflankFile = resolve(ROOT_DIR, "backend/backendA-platform-infra/deploy/northflank/render-template.mjs"),
) {
  if (!existsSync(northflankFile)) return [];
  const content = readFileSync(northflankFile, "utf8");
  const services = [];
  const regex = /deploymentFrom(?:Internal|External)\(\{\s*name:\s*"([^"]+)"/gms;
  let match;
  while ((match = regex.exec(content)) !== null) {
    services.push(String(match[1]).trim());
  }
  return [...new Set(services.filter(Boolean))];
}

export function readMeshServices() {
  return SERVICE_MESH_TARGETS.map((entry) => String(entry.name)).filter(Boolean);
}

export function scoreDecision(necessityScore, utilizationScore) {
  if (necessityScore >= 70 && utilizationScore >= 60) {
    return "keep";
  }
  if (necessityScore >= 70 && utilizationScore < 60) {
    return "repair_utilization";
  }
  if (necessityScore < 40 && utilizationScore < 20) {
    return "decommission_candidate";
  }
  return "consolidate_candidate";
}

export function resolvePolicyLevel(raw, fallback = "advisory") {
  const normalized = String(raw ?? fallback).trim().toLowerCase();
  if (normalized === "required" || normalized === "strict" || normalized === "enforced") {
    return "required";
  }
  return "advisory";
}
