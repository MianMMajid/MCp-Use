#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ARTIFACT_DIR = resolve(ROOT_DIR, "artifacts/debt");
const REPORT_JSON = resolve(ARTIFACT_DIR, "debt-register-report.json");
const REPORT_MD = resolve(ARTIFACT_DIR, "debt-register-report.md");

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function statusFromItem(item, evidence) {
  switch (item.id) {
    case "matrix-flake-risk": {
      const flake = evidence.flake;
      if (!flake) return { state: "unknown", detail: "flake summary missing" };
      const fail = Number(flake?.summary?.failCount ?? 0);
      const flakes = Number(flake?.summary?.flakeMarkerCount ?? 0);
      if (fail === 0 && flakes === 0) return { state: "pass", detail: `runs=${flake.iterations}, failures=0, flakeMarkers=0` };
      return { state: "fail", detail: `runs=${flake.iterations}, failures=${fail}, flakeMarkers=${flakes}` };
    }
    case "stateful-suite-instability": {
      const stateful = evidence.stateful;
      if (!stateful) return { state: "unknown", detail: "stateful suite summary missing" };
      const failingSuites = (stateful.suites ?? []).filter((row) => Number(row.failCount ?? 0) > 0);
      if (failingSuites.length === 0) return { state: "pass", detail: `suites=${(stateful.suites ?? []).length}, no failures` };
      return { state: "fail", detail: `failing suites: ${failingSuites.map((row) => row.suite).join(", ")}` };
    }
    case "live-provider-realism": {
      const matrix = evidence.fullMatrix;
      const liveSkip = evidence.liveSkip;
      if (matrix?.stages?.liveProviderMatrix === "passed") {
        return { state: "pass", detail: "live provider matrix passed" };
      }
      if (liveSkip) {
        return {
          state: "warn",
          detail: `live matrix skipped (${liveSkip.reason || "missing reason"}); missing env: ${(liveSkip.missingEnv || []).join(", ")}`,
        };
      }
      return { state: "unknown", detail: "live provider stage not observed" };
    }
    case "dependency-security-debt": {
      const dep = evidence.dependency;
      if (!dep) return { state: "unknown", detail: "dependency report missing" };
      const critical = Number(dep?.totals?.critical ?? 0);
      const high = Number(dep?.totals?.high ?? 0);
      const deprecated = Number(dep?.totals?.deprecated ?? 0);
      if (critical === 0 && high === 0 && deprecated === 0) {
        return { state: "pass", detail: "no high/critical/deprecated findings" };
      }
      if (critical > 0 || high > 0) {
        return { state: "fail", detail: `critical=${critical} high=${high} deprecated=${deprecated}` };
      }
      return { state: "warn", detail: `deprecated=${deprecated}` };
    }
    case "docs-architecture-drift": {
      const docs = evidence.docs;
      if (!docs) return { state: "unknown", detail: "docs drift report missing" };
      return docs.ok ? { state: "pass", detail: "docs in sync" } : { state: "fail", detail: `${(docs.violations ?? []).length} violations` };
    }
    case "utilization-fidelity": {
      const util = evidence.util;
      if (!util || !Array.isArray(util.services)) {
        return { state: "unknown", detail: "k8s utilization summary missing" };
      }
      const violations = (util.services ?? [])
        .filter((row) => row.required && String(row.lifecycle ?? "").toLowerCase() !== "retired")
        .filter((row) => String(row.runtimeEvidenceSource ?? "gateway") !== "external")
        .filter((row) => String(row.runtimeEvidenceMode ?? "none") !== "k8s_live" || Number(row?.evidence?.runtimeCalls14d ?? 0) <= 0)
        .map((row) => row.service);
      if (violations.length === 0) {
        return { state: "pass", detail: "retained services have k8s_live evidence" };
      }
      return { state: "fail", detail: `missing k8s_live evidence: ${violations.join(", ")}` };
    }
    default:
      return { state: "unknown", detail: "no evaluator for item" };
  }
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Debt Register Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Policy: ${report.policy}`);
  lines.push(`Overall OK: ${report.ok}`);
  lines.push("");
  lines.push("| ID | Severity | Owner | Due | Status | CI Guard | Detail |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const row of report.items) {
    lines.push(`| ${row.id} | ${row.severity} | ${row.owner} | ${row.dueDate} | ${row.evaluation.state} | ${row.ciGuard} | ${row.evaluation.detail} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const policy = String(process.env.DEBT_REGISTER_POLICY ?? "required").toLowerCase();
  const registerPath = resolve(ROOT_DIR, "docs/debt-register.yaml");
  const register = loadYaml(readFileSync(registerPath, "utf8")) ?? {};
  const items = Array.isArray(register.items) ? register.items : [];

  const evidence = {
    flake: readJson(resolve(ROOT_DIR, "artifacts/matrix/flake-repetition-summary.json"), null),
    stateful: readJson(resolve(ROOT_DIR, "artifacts/matrix/stateful-suite-loop-summary.json"), null),
    fullMatrix: readJson(resolve(ROOT_DIR, "artifacts/matrix/full-matrix-summary.json"), null),
    liveSkip: readJson(resolve(ROOT_DIR, "artifacts/matrix/live-suite-skip.json"), null),
    dependency: readJson(resolve(ROOT_DIR, "artifacts/debt/dependency-security-report.json"), null),
    docs: readJson(resolve(ROOT_DIR, "artifacts/debt/docs-architecture-drift.json"), null),
    util: readJson(resolve(ROOT_DIR, "artifacts/matrix/k8s-service-utilization-summary.json"), null),
  };

  const evaluated = items.map((item) => ({
    ...item,
    evaluation: statusFromItem(item, evidence),
  }));

  const blocking = evaluated.filter((row) => row.evaluation.state === "fail");
  const highRiskOpen = evaluated.filter(
    (row) => String(row.severity ?? "").toLowerCase() === "high" && row.evaluation.state !== "pass",
  );

  const report = {
    artifactSchemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy,
    ok: blocking.length === 0,
    summary: {
      totalItems: evaluated.length,
      failedItems: blocking.length,
      highRiskOpen: highRiskOpen.length,
    },
    items: evaluated,
  };

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(REPORT_MD, toMarkdown(report));

  process.stdout.write(`[debt-register] Report: ${REPORT_JSON}\n`);
  if (policy === "required" && blocking.length > 0) {
    process.exit(1);
  }
}

main();
