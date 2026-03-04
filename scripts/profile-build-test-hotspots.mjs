#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICE_MESH_TARGETS } from "../backend/backendA-platform-infra/scripts/service-mesh-manifest.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = resolve(ROOT_DIR, "artifacts/matrix");
const JSON_OUT = resolve(ARTIFACT_DIR, "build-test-hotspots.json");
const MD_OUT = resolve(ARTIFACT_DIR, "build-test-hotspots.md");

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  for (const token of argv) {
    flags.add(String(token));
  }
  return {
    skipFrontend: flags.has("--skip-frontend"),
    skipBuilds: flags.has("--skip-builds"),
    skipTests: flags.has("--skip-tests"),
  };
}

function runTask(task) {
  const startedAt = new Date();
  const startNs = process.hrtime.bigint();
  const run = spawnSync(task.cmd, task.args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "test",
      MAPLE_LOG_LEVEL: process.env.MAPLE_LOG_LEVEL || "error",
      MAPLE_LOG_REQUESTS: process.env.MAPLE_LOG_REQUESTS || "0",
      MAPLE_LOG_INCLUDE_BODIES: process.env.MAPLE_LOG_INCLUDE_BODIES || "0",
      MAPLE_LOG_BODY_MAX_CHARS: process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000",
      MAPLE_FIREWALL_LOG_DIR: process.env.MAPLE_FIREWALL_LOG_DIR || "~/.maple/firewall-logs",
    },
    stdio: "pipe",
    maxBuffer: 1024 * 1024 * 64,
  });
  const endNs = process.hrtime.bigint();
  const durationMs = Number((endNs - startNs) / 1000000n);
  return {
    ...task,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs,
    exitCode: run.status ?? 1,
    ok: (run.status ?? 1) === 0,
    stderrTail: String(run.stderr ?? "").split(/\r?\n/).filter(Boolean).slice(-8),
    stdoutTail: String(run.stdout ?? "").split(/\r?\n/).filter(Boolean).slice(-8),
  };
}

function asMinutes(ms) {
  return Number((ms / 60000).toFixed(2));
}

function buildTasks(options) {
  const tasks = [];
  if (!options.skipBuilds) {
    for (const target of SERVICE_MESH_TARGETS) {
      tasks.push({
        category: "service-build",
        label: `build:${target.name}`,
        cmd: process.execPath,
        args: ["backend/backendA-platform-infra/scripts/build-service.mjs", target.servicePath],
      });
    }
  }
  if (!options.skipTests) {
    tasks.push({ category: "test", label: "test:mesh-services", cmd: "npm", args: ["run", "test:mesh-services"] });
    tasks.push({ category: "test", label: "test:saas-services", cmd: "npm", args: ["run", "test:saas-services"] });
    tasks.push({ category: "test", label: "test:infra-scripts", cmd: "npm", args: ["run", "test:infra-scripts"] });
    tasks.push({
      category: "test",
      label: "test:gateway-heavy",
      cmd: process.execPath,
      args: [
        "--test",
        "backend/backendB-core-services/gateway-api/service/tests/e2e-app.test.mjs",
        "backend/backendB-core-services/gateway-api/service/tests/integration-load.test.mjs",
        "backend/backendB-core-services/gateway-api/service/tests/load-test.test.mjs",
      ],
    });
    if (!options.skipFrontend) {
      tasks.push({ category: "test", label: "test:frontend:flow:ci", cmd: "npm", args: ["run", "test:frontend:flow:ci"] });
    }
  }
  return tasks;
}

function buildReport(results) {
  const generatedAt = new Date().toISOString();
  const sorted = [...results].sort((a, b) => b.durationMs - a.durationMs);
  const top10 = sorted.slice(0, 10);
  const totalDurationMs = results.reduce((sum, row) => sum + row.durationMs, 0);
  const cacheMissCandidates = sorted
    .filter((row) => row.category === "service-build" && row.durationMs > 60000)
    .map((row) => row.label);
  const failures = sorted.filter((row) => !row.ok).map((row) => row.label);

  return {
    artifactSchemaVersion: 1,
    generatedAt,
    ok: failures.length === 0,
    totals: {
      tasks: results.length,
      totalDurationMs,
      totalDurationMinutes: asMinutes(totalDurationMs),
      failures: failures.length,
    },
    topSlowTasks: top10.map((row, index) => ({
      rank: index + 1,
      label: row.label,
      category: row.category,
      durationMs: row.durationMs,
      durationMinutes: asMinutes(row.durationMs),
      ok: row.ok,
    })),
    cacheMissCandidates,
    duplicateBuildCandidates: [],
    failures,
    results,
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Build/Test Hotspot Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Total tasks: ${report.totals.tasks}`);
  lines.push(`Total duration (minutes): ${report.totals.totalDurationMinutes}`);
  lines.push(`Failures: ${report.totals.failures}`);
  lines.push("");
  lines.push("## Slowest 10 Tasks");
  lines.push("");
  lines.push("| Rank | Task | Category | Duration (min) | OK |\n|---:|---|---|---:|---:|");
  for (const row of report.topSlowTasks) {
    lines.push(`| ${row.rank} | ${row.label} | ${row.category} | ${row.durationMinutes} | ${row.ok ? "yes" : "no"} |`);
  }
  lines.push("");
  lines.push("## Cache Miss Candidates");
  lines.push("");
  if (report.cacheMissCandidates.length === 0) {
    lines.push("- none");
  } else {
    for (const task of report.cacheMissCandidates) {
      lines.push(`- ${task}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs();
  const tasks = buildTasks(options);
  const results = [];

  for (const task of tasks) {
    process.stdout.write(`\n[hotspots] Running ${task.label}\n`);
    const result = runTask(task);
    results.push(result);
    process.stdout.write(`[hotspots] ${task.label} -> ${result.ok ? "ok" : "failed"} (${result.durationMs}ms)\n`);
  }

  const report = buildReport(results);
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  writeFileSync(MD_OUT, toMarkdown(report));

  process.stdout.write(`[hotspots] Report: ${JSON_OUT}\n`);
  if (!report.ok) {
    process.exit(1);
  }
}

main();
