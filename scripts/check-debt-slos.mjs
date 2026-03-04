#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ARTIFACT_DIR = resolve(ROOT_DIR, "artifacts/debt");
const STATUS_JSON = resolve(ARTIFACT_DIR, "debt-slo-status.json");
const STATUS_MD = resolve(ARTIFACT_DIR, "debt-slo-status.md");

function parseArgs(argv = process.argv.slice(2)) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] ?? "");
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !String(next).startsWith("--")) {
      map.set(key, String(next));
      i += 1;
      continue;
    }
    map.set(key, "true");
  }
  return map;
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function nowIso() {
  return new Date().toISOString();
}

function parseIsoMs(value) {
  const ts = Date.parse(String(value ?? ""));
  return Number.isFinite(ts) ? ts : null;
}

function matrixDurationMs(summary) {
  if (!summary || typeof summary !== "object") return null;
  const details = summary.stageDetails ?? {};
  const times = [];
  for (const row of Object.values(details)) {
    if (!row || typeof row !== "object") continue;
    const start = parseIsoMs(row.startedAt);
    const end = parseIsoMs(row.finishedAt);
    if (start !== null) times.push(start);
    if (end !== null) times.push(end);
  }
  if (times.length === 0) return null;
  return Math.max(...times) - Math.min(...times);
}

function countNonAllowlistedWarnings(logContent) {
  const warningSignal = /warning|deprecated|⚠/i;
  const allowlist = [
    /NO_COLOR.*FORCE_COLOR/i,
    /MAPLE_GATEWAY_ORIGIN is not set/i,
    /Cross origin request detected from 127\.0\.0\.1/i,
    /#\s*Check frontend warning budget/i,
    /\[frontend-warning-budget\]\s+OK:/i,
  ];
  let count = 0;
  const samples = [];
  for (const line of logContent.split(/\r?\n/)) {
    if (!warningSignal.test(line)) continue;
    if (allowlist.some((pattern) => pattern.test(line))) continue;
    count += 1;
    if (samples.length < 10) samples.push(line.trim());
  }
  return { count, samples };
}

function evaluateUtilization(utilReport, requiredMode, minCalls) {
  if (!utilReport || !Array.isArray(utilReport.services)) {
    return { ok: false, violations: ["missing utilization report"], sampled: 0 };
  }
  const violations = [];
  let sampled = 0;
  for (const row of utilReport.services) {
    if (!row?.required) continue;
    if (String(row?.lifecycle ?? "").toLowerCase() === "retired") continue;
    if (String(row?.runtimeEvidenceSource ?? "gateway") === "external") continue;
    sampled += 1;
    const mode = String(row?.runtimeEvidenceMode ?? "none");
    const calls = Number(row?.evidence?.runtimeCalls14d ?? 0);
    if (mode !== requiredMode) {
      violations.push(`${row.service}: runtimeEvidenceMode=${mode}, expected ${requiredMode}`);
      continue;
    }
    if (calls < minCalls) {
      violations.push(`${row.service}: runtimeCalls14d=${calls}, required >= ${minCalls}`);
    }
  }
  return { ok: violations.length === 0, violations, sampled };
}

function toMarkdown(status) {
  const lines = [];
  lines.push("# Debt SLO Status");
  lines.push("");
  lines.push(`Generated: ${status.generatedAt}`);
  lines.push(`Policy: ${status.policy}`);
  lines.push(`Overall OK: ${status.ok}`);
  lines.push("");
  lines.push("| SLO | Status | Details |");
  lines.push("|---|---|---|");
  for (const row of status.checks) {
    lines.push(`| ${row.name} | ${row.ok ? "pass" : "fail"} | ${row.details} |`);
  }
  lines.push("");
  if (status.violations.length > 0) {
    lines.push("## Violations");
    lines.push("");
    for (const violation of status.violations) {
      lines.push(`- ${violation}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs();
  const policy = String(args.get("policy") ?? process.env.DEBT_SLO_POLICY ?? "required").toLowerCase();

  const slosFile = resolve(ROOT_DIR, args.get("slos") ?? "docs/debt-slos.yaml");
  const slos = loadYaml(readFileSync(slosFile, "utf8")) ?? {};
  const config = slos.slo ?? {};

  const pkg = JSON.parse(readFileSync(resolve(ROOT_DIR, "package.json"), "utf8"));
  const rootScriptCount = Object.keys(pkg.scripts ?? {}).length;
  const maxRootScripts = Number(process.env.DEBT_SLO_MAX_ROOT_SCRIPTS ?? config.maxRootScripts ?? 60);

  const matrixSummary = readJson(resolve(ROOT_DIR, "artifacts/matrix/full-matrix-summary.json"), null);
  const matrixDuration = matrixDurationMs(matrixSummary);
  const maxMatrixMinutes = Number(process.env.DEBT_SLO_MAX_MATRIX_MINUTES ?? config?.matrixDuration?.maxMinutes ?? 75);
  const maxMatrixDurationMs = maxMatrixMinutes * 60 * 1000;

  const baselineSummary = readJson(resolve(ROOT_DIR, "artifacts/matrix/full-matrix-summary.baseline.json"), null);
  const baselineDuration = matrixDurationMs(baselineSummary);
  const regressionThresholdPct = Number(
    process.env.DEBT_SLO_MATRIX_REGRESSION_PCT ?? config?.matrixDuration?.regressionThresholdPct ?? 20,
  );

  const flakeSummary = readJson(resolve(ROOT_DIR, "artifacts/matrix/flake-repetition-summary.json"), null);
  const minRuns = Number(process.env.DEBT_SLO_FLAKE_MIN_RUNS ?? config?.flakeBudget?.minRuns ?? 5);
  const maxFailedRuns = Number(process.env.DEBT_SLO_MAX_FAILED_RUNS ?? config?.flakeBudget?.maxFailedRuns ?? 0);
  const maxFlakeMarkerRuns = Number(
    process.env.DEBT_SLO_MAX_FLAKE_MARKER_RUNS ?? config?.flakeBudget?.maxFlakeMarkerRuns ?? 0,
  );

  const warningLogPath = resolve(ROOT_DIR, "artifacts/matrix/frontend-flow.log");
  const warningStats = existsSync(warningLogPath)
    ? countNonAllowlistedWarnings(readFileSync(warningLogPath, "utf8"))
    : { count: 0, samples: [] };
  const maxWarnings = Number(
    process.env.DEBT_SLO_MAX_WARNINGS ?? config?.warningBudget?.maxNonAllowlistedWarnings ?? 0,
  );

  const utilizationFile = resolve(ROOT_DIR, "artifacts/matrix/k8s-service-utilization-summary.json");
  const utilReport = readJson(utilizationFile, null);
  const utilMode = String(
    process.env.DEBT_SLO_UTILIZATION_MODE ?? config?.utilization?.requiredRuntimeEvidenceMode ?? "k8s_live",
  );
  const utilMinCalls = Number(
    process.env.DEBT_SLO_UTILIZATION_MIN_CALLS ?? config?.utilization?.retainedServiceMinCalls ?? 1,
  );
  const requireUtilization = String(
    process.env.DEBT_SLO_REQUIRE_UTILIZATION ??
      config?.utilization?.enforceInGate ??
      true,
  )
    .toLowerCase()
    .trim();
  const utilizationRequired = requireUtilization === "1" || requireUtilization === "true" || requireUtilization === "yes";
  const utilStatus = evaluateUtilization(utilReport, utilMode, utilMinCalls);

  const checks = [];
  const violations = [];

  const scriptOk = rootScriptCount <= maxRootScripts;
  checks.push({ name: "max-root-scripts", ok: scriptOk, details: `${rootScriptCount}/${maxRootScripts}` });
  if (!scriptOk) violations.push(`root scripts ${rootScriptCount} exceed limit ${maxRootScripts}`);

  const warningOk = warningStats.count <= maxWarnings;
  checks.push({ name: "warning-budget", ok: warningOk, details: `${warningStats.count}/${maxWarnings}` });
  if (!warningOk) {
    violations.push(`non-allowlisted warnings ${warningStats.count} exceed ${maxWarnings}`);
    for (const sample of warningStats.samples.slice(0, 5)) {
      violations.push(`warning sample: ${sample}`);
    }
  }

  let flakeRuns = 0;
  let flakeFailures = 0;
  let flakeMarkers = 0;
  if (flakeSummary) {
    flakeRuns = Number(flakeSummary.iterations ?? 0);
    flakeFailures = Number(flakeSummary?.summary?.failCount ?? 0);
    flakeMarkers = Number(flakeSummary?.summary?.flakeMarkerCount ?? 0);
  } else if (matrixSummary) {
    flakeRuns = 1;
    flakeFailures = matrixSummary.ok ? 0 : 1;
    flakeMarkers = matrixSummary.flakeMarker ? 1 : 0;
  }
  const flakeOk = flakeRuns >= minRuns && flakeFailures <= maxFailedRuns && flakeMarkers <= maxFlakeMarkerRuns;
  checks.push({
    name: "flake-budget",
    ok: flakeOk,
    details: `runs=${flakeRuns} failures=${flakeFailures}/${maxFailedRuns} flakeMarkers=${flakeMarkers}/${maxFlakeMarkerRuns} minRuns=${minRuns}`,
  });
  if (!flakeOk) {
    violations.push(`flake budget breach: runs=${flakeRuns}, failures=${flakeFailures}, flakeMarkers=${flakeMarkers}`);
  }

  const durationOk = matrixDuration === null || matrixDuration <= maxMatrixDurationMs;
  checks.push({
    name: "max-matrix-duration",
    ok: durationOk,
    details: matrixDuration === null ? "not-sampled" : `${(matrixDuration / 60000).toFixed(2)}min <= ${maxMatrixMinutes}min`,
  });
  if (!durationOk) {
    violations.push(`matrix duration ${(matrixDuration / 60000).toFixed(2)}min exceeds ${maxMatrixMinutes}min`);
  }

  if (matrixDuration !== null && baselineDuration !== null && baselineDuration > 0) {
    const allowed = baselineDuration * (1 + regressionThresholdPct / 100);
    const regressionOk = matrixDuration <= allowed;
    checks.push({
      name: "matrix-duration-regression",
      ok: regressionOk,
      details: `${(matrixDuration / 60000).toFixed(2)}min vs baseline ${(baselineDuration / 60000).toFixed(2)}min (+${regressionThresholdPct}%)`,
    });
    if (!regressionOk) {
      violations.push(`matrix duration regression exceeds +${regressionThresholdPct}% baseline threshold`);
    }
  }

  const utilOk = utilizationRequired ? utilStatus.ok : true;
  checks.push({
    name: "utilization-runtime-evidence",
    ok: utilOk,
    details: `required=${utilizationRequired} sampled=${utilStatus.sampled} mode=${utilMode} minCalls=${utilMinCalls}`,
  });
  if (utilizationRequired && !utilStatus.ok) {
    for (const violation of utilStatus.violations) {
      violations.push(`utilization: ${violation}`);
    }
  }

  const status = {
    artifactSchemaVersion: 1,
    generatedAt: nowIso(),
    policy,
    ok: violations.length === 0,
    checks,
    violations,
  };

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(STATUS_JSON, JSON.stringify(status, null, 2));
  writeFileSync(STATUS_MD, toMarkdown(status));

  process.stdout.write(`[debt-slo] Report: ${STATUS_JSON}\n`);
  if (!status.ok && policy === "required") {
    process.exit(1);
  }
}

main();
