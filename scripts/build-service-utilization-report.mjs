import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_CALLGRAPH_FILE,
  DEFAULT_INVENTORY_FILE,
  DEFAULT_REPORT_JSON_FILE,
  DEFAULT_REPORT_MD_FILE,
  DEFAULT_RUNTIME_EVENTS_FILE,
  ROOT_DIR,
  nowIso,
  parseArgs,
  readJsonIfExists,
  readServiceCatalog,
  scoreDecision,
  writeJson,
} from "./service-audit-common.mjs";
import { buildServiceInventory } from "./service-inventory.mjs";
import { buildStaticCallgraph } from "./service-callgraph-static.mjs";

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function scoreNecessity(catalogRow) {
  const necessity = catalogRow?.necessity ?? {};
  const criticalPath = toNumber(necessity.criticalPath, 0);
  const uniqueCapability = toNumber(necessity.uniqueCapability, 0);
  const complianceSecurity = toNumber(necessity.complianceSecurity, 0);
  const operationalEfficiency = toNumber(necessity.operationalEfficiency, 0);
  return {
    components: {
      criticalPath,
      uniqueCapability,
      complianceSecurity,
      operationalEfficiency,
    },
    score: clampScore(
      criticalPath * 0.35 +
        uniqueCapability * 0.25 +
        complianceSecurity * 0.2 +
        operationalEfficiency * 0.2,
    ),
  };
}

function scoreUtilization({ activeCallPathCoverage, runtimeInvocationVolume, testCoverage, featureAlignment }) {
  return clampScore(
    activeCallPathCoverage * 0.4 +
      runtimeInvocationVolume * 0.3 +
      testCoverage * 0.2 +
      featureAlignment * 0.1,
  );
}

function loadRuntimeCountsFromEvents(filePath, windowStartMs) {
  if (!existsSync(filePath)) return new Map();
  const rows = readFileSync(filePath, "utf8")
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const counts = new Map();
  for (const row of rows) {
    const service = String(row.service ?? row.callee ?? "").trim();
    if (!service) continue;
    const timestamp = Date.parse(String(row.timestamp ?? row.ts ?? ""));
    if (Number.isFinite(timestamp) && timestamp < windowStartMs) continue;
    const current = counts.get(service) ?? 0;
    counts.set(service, current + 1);
  }
  return counts;
}

function loadRuntimeCountsFromSnapshot(snapshotFile, windowStartMs) {
  if (!snapshotFile || !existsSync(snapshotFile)) return new Map();
  const parsed = readJsonIfExists(snapshotFile, {});
  const snapshot = parsed?.snapshot && typeof parsed.snapshot === "object"
    ? parsed.snapshot
    : parsed;
  const counts = new Map();
  const byService = snapshot?.callsByService;
  if (byService && typeof byService === "object") {
    for (const [service, value] of Object.entries(byService)) {
      if (!service) continue;
      counts.set(service, Number(value?.total ?? value?.count ?? 0));
    }
    return counts;
  }
  if (Array.isArray(snapshot?.events)) {
    for (const row of snapshot.events) {
      const service = String(row.service ?? row.callee ?? "").trim();
      if (!service) continue;
      const timestamp = Date.parse(String(row.timestamp ?? row.ts ?? ""));
      if (Number.isFinite(timestamp) && timestamp < windowStartMs) continue;
      counts.set(service, (counts.get(service) ?? 0) + 1);
    }
  }
  return counts;
}

function countTestCoverageHits(service) {
  const targets = ["backend", "tests"];
  try {
    const output = execFileSync(
      "rg",
      [
        "-n",
        "--glob",
        "**/tests/**",
        "--glob",
        "*.test.*",
        "--glob",
        "*.spec.*",
        "--glob",
        "*.e2e.*",
        service,
        ...targets,
      ],
      { cwd: ROOT_DIR, encoding: "utf8" },
    );
    return output.split(/\n+/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

function loadInventory(inventoryFile) {
  const resolved = resolve(ROOT_DIR, inventoryFile);
  const existing = readJsonIfExists(resolved, null);
  if (existing) return existing;
  const generated = buildServiceInventory();
  writeJson(resolved, generated);
  return generated;
}

function loadCallgraph(callgraphFile) {
  const resolved = resolve(ROOT_DIR, callgraphFile);
  const existing = readJsonIfExists(resolved, null);
  if (existing) return existing;
  const generated = buildStaticCallgraph();
  writeJson(resolved, generated);
  return generated;
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Service Utilization Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Window: ${report.windowDays} days`);
  lines.push("");
  lines.push("| Service | Required | Lifecycle | Runtime Evidence Mode | Necessity | Utilization | Runtime Calls | Decision |");
  lines.push("|---|---:|---:|---|---:|---:|---:|---|");
  for (const row of report.services) {
    const runtimeCalls =
      row.evidence.runtimeCalls14d === null || row.evidence.runtimeCalls14d === undefined
        ? "n/a"
        : String(row.evidence.runtimeCalls14d);
    lines.push(
      `| ${row.service} | ${row.required ? "yes" : "no"} | ${row.lifecycle} | ${row.runtimeEvidenceMode} | ${row.necessityScore} | ${row.utilizationScore} | ${runtimeCalls} | ${row.decision} |`,
    );
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Keep: ${report.summary.decisions.keep}`);
  lines.push(`- Repair utilization: ${report.summary.decisions.repair_utilization}`);
  lines.push(`- Consolidate candidates: ${report.summary.decisions.consolidate_candidate}`);
  lines.push(`- Decommission candidates: ${report.summary.decisions.decommission_candidate}`);
  lines.push(`- Retired: ${report.summary.decisions.retired}`);
  if (Array.isArray(report.summary.retiredServices) && report.summary.retiredServices.length > 0) {
    lines.push(`- Retired services: ${report.summary.retiredServices.join(", ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function buildServiceUtilizationReport(options = {}) {
  const windowDays = Math.max(1, Number(options.windowDays ?? 14));
  const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  const inventory = loadInventory(options.inventoryFile ?? DEFAULT_INVENTORY_FILE);
  const callgraph = loadCallgraph(options.callgraphFile ?? DEFAULT_CALLGRAPH_FILE);
  const catalog = readServiceCatalog(options.catalogFile);

  const serviceCoverage = new Map(
    (Array.isArray(callgraph.serviceCoverage) ? callgraph.serviceCoverage : []).map((row) => [
      row.service,
      row,
    ]),
  );

  const runtimeFromEvents = loadRuntimeCountsFromEvents(
    resolve(ROOT_DIR, options.runtimeEventsFile ?? DEFAULT_RUNTIME_EVENTS_FILE),
    windowStartMs,
  );
  const runtimeFromSnapshot = loadRuntimeCountsFromSnapshot(
    options.runtimeSnapshotFile ? resolve(ROOT_DIR, options.runtimeSnapshotFile) : "",
    windowStartMs,
  );
  const hasRuntimeSnapshotInput = Boolean(options.runtimeSnapshotFile);

  const services = [];
  const runtimeEventTotal = [...runtimeFromEvents.values()].reduce((sum, value) => sum + Number(value ?? 0), 0);
  const runtimeSnapshotTotal = [...runtimeFromSnapshot.values()].reduce(
    (sum, value) => sum + Number(value ?? 0),
    0,
  );
  const runtimeAggregateTotal = Math.max(runtimeEventTotal, runtimeSnapshotTotal);
  const decisions = {
    keep: 0,
    repair_utilization: 0,
    consolidate_candidate: 0,
    decommission_candidate: 0,
    retired: 0,
  };

  const targetServices = new Set([
    ...catalog.byService.keys(),
    ...(inventory.services ?? [])
      .filter((row) => row?.presentIn?.meshManifest === true)
      .map((row) => row.service),
  ]);

  for (const entry of inventory.services ?? []) {
    const service = String(entry.service ?? "").trim();
    if (!service) continue;
    if (!targetServices.has(service)) continue;
    const catalogRow = catalog.byService.get(service) ?? {};
    const lifecycle = String(catalogRow.lifecycle ?? "active").trim().toLowerCase() || "active";
    const retired = lifecycle === "retired" || lifecycle === "decommissioned";
    const coverage = serviceCoverage.get(service);
    let runtimeCalls14d = Math.max(
      Number(runtimeFromEvents.get(service) ?? 0),
      Number(runtimeFromSnapshot.get(service) ?? 0),
    );
    const runtimeEvidenceSource = catalogRow.runtimeEvidenceSource ?? "gateway";
    let runtimeEvidenceMode;
    if (hasRuntimeSnapshotInput) {
      runtimeEvidenceMode = "k8s_live";
    } else if (runtimeEventTotal > 0) {
      runtimeEvidenceMode = runtimeEvidenceSource === "external" ? "external" : "matrix";
    } else {
      runtimeEvidenceMode = "none";
    }
    if (service === "gateway-api") {
      runtimeCalls14d = Math.max(runtimeCalls14d, runtimeAggregateTotal);
    }
    if (runtimeEvidenceMode === "none") {
      runtimeCalls14d = null;
    }
    const testsHitCount = countTestCoverageHits(service);
    let activeCallPathCoverage = coverage?.routeCount > 0 ? 100 : 0;
    if (service === "gateway-api" && (callgraph.routes?.length ?? 0) > 0) {
      activeCallPathCoverage = 100;
    }
    if (runtimeEvidenceSource === "external") {
      activeCallPathCoverage = entry?.presentIn?.k8sDeployment || entry?.presentIn?.meshManifest ? 100 : activeCallPathCoverage;
    }
    const runtimeInvocationVolume =
      runtimeEvidenceMode === "none"
        ? 0
        : runtimeEvidenceSource === "external"
          ? Number(runtimeCalls14d ?? 0) > 0
            ? 100
            : 50
          : Number(runtimeCalls14d ?? 0) > 0
            ? 100
            : 0;
    const testCoverage = testsHitCount > 0 ? 100 : 0;
    const featureAlignment = toNumber(catalogRow.featureAlignment, 80);

    const necessity = scoreNecessity(catalogRow);
    const utilizationScore = scoreUtilization({
      activeCallPathCoverage,
      runtimeInvocationVolume,
      testCoverage,
      featureAlignment,
    });
    const decision = retired ? "retired" : scoreDecision(necessity.score, utilizationScore);
    decisions[decision] += 1;

    services.push({
      service,
      owner: catalogRow.owner ?? entry.owner ?? "unassigned",
      tier: catalogRow.tier ?? entry.tier ?? "unknown",
      required: catalogRow.required === true,
      lifecycle,
      retired,
      runtimeEvidenceSource,
      runtimeEvidenceMode,
      necessityScore: necessity.score,
      utilizationScore,
      decision,
      evidence: {
        activeRouteCount: Number(coverage?.routeCount ?? 0),
        activeRouteIds: Array.isArray(coverage?.routeIds) ? coverage.routeIds : [],
        modes: Array.isArray(coverage?.modes) ? coverage.modes : [],
        runtimeCalls14d,
        testsHitCount,
      },
      necessityComponents: necessity.components,
      utilizationComponents: {
        activeCallPathCoverage,
        runtimeInvocationVolume,
        testCoverage,
        featureAlignment,
      },
      criticalFlows: Array.isArray(catalogRow.criticalFlows) ? catalogRow.criticalFlows : [],
      replacement: catalogRow.replacement ?? "",
      deadline:
        decision === "decommission_candidate"
          ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
          : "",
    });
  }

  services.sort((a, b) => a.service.localeCompare(b.service));
  const retained = services.filter((row) => row.required && !row.retired);
  const retiredServices = services.filter((row) => row.retired).map((row) => row.service);
  const zeroUseRetained = retained.filter((row) => Number(row.evidence.runtimeCalls14d) === 0);

  return {
    artifactSchemaVersion: 2,
    ok: true,
    generatedAt: nowIso(),
    windowDays,
    sources: {
      inventory: options.inventoryFile ?? DEFAULT_INVENTORY_FILE,
      callgraph: options.callgraphFile ?? DEFAULT_CALLGRAPH_FILE,
      runtimeEvents: options.runtimeEventsFile ?? DEFAULT_RUNTIME_EVENTS_FILE,
      runtimeSnapshot: options.runtimeSnapshotFile ?? "",
      serviceCatalog: options.catalogFile ?? "service-catalog.yaml",
    },
    summary: {
      serviceCount: services.length,
      retainedCount: retained.length,
      zeroUseRetainedCount: zeroUseRetained.length,
      retiredServices,
      decisions,
    },
    services,
  };
}

export function runBuildServiceUtilizationReport() {
  const args = parseArgs();
  const outputDir = args.get("output-dir")
    ? resolve(ROOT_DIR, args.get("output-dir"))
    : resolve(ROOT_DIR, "artifacts/service-audit");
  const jsonOut = resolve(
    ROOT_DIR,
    args.get("json-out") ?? resolve(outputDir, "utilization-report.json"),
  );
  const mdOut = resolve(
    ROOT_DIR,
    args.get("md-out") ?? resolve(outputDir, "utilization-report.md"),
  );

  const report = buildServiceUtilizationReport({
    windowDays: args.get("window-days") ?? args.get("window") ?? 14,
    inventoryFile: args.get("inventory") ?? DEFAULT_INVENTORY_FILE,
    callgraphFile: args.get("callgraph") ?? DEFAULT_CALLGRAPH_FILE,
    runtimeEventsFile: args.get("runtime-events") ?? DEFAULT_RUNTIME_EVENTS_FILE,
    runtimeSnapshotFile: args.get("runtime-snapshot"),
    catalogFile: args.get("catalog"),
  });

  writeJson(jsonOut, report);
  const markdown = toMarkdown(report);
  writeFileSync(mdOut, markdown);
  process.stdout.write(
    `[service-utilization-report] wrote ${jsonOut} and ${mdOut} (${report.services.length} services)\n`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runBuildServiceUtilizationReport();
}
