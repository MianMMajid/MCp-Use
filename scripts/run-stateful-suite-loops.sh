#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/matrix"
SUMMARY_FILE="${ARTIFACT_DIR}/stateful-suite-loop-summary.json"
REPORT_FILE="${ARTIFACT_DIR}/stateful-suite-loop-summary.md"
ITERATIONS="${STATEFUL_LOOP_ITERATIONS:-20}"

if (( $# > 0 )); then
  case "$1" in
    --iterations)
      ITERATIONS="$2"
      shift 2
      ;;
  esac
fi

if ! [[ "${ITERATIONS}" =~ ^[0-9]+$ ]] || [ "${ITERATIONS}" -lt 1 ]; then
  echo "[stateful-loop] --iterations must be a positive integer." >&2
  exit 2
fi

mkdir -p "${ARTIFACT_DIR}"

SUITE_LABELS=(
  "trace-exporter"
  "infra-scripts"
  "runtime-dependencies-startup"
)

SUITE_COMMANDS=(
  "NODE_ENV=test MAPLE_LOG_LEVEL=error MAPLE_LOG_REQUESTS=0 MAPLE_LOG_INCLUDE_BODIES=0 MAPLE_LOG_BODY_MAX_CHARS=4000 MAPLE_FIREWALL_LOG_DIR=~/.maple/firewall-logs node --test backend/backendB-core-services/gateway-api/service/tests/trace-exporter.test.mjs"
  "npm run test:infra-scripts"
  "NODE_ENV=test MAPLE_LOG_LEVEL=error MAPLE_LOG_REQUESTS=0 MAPLE_LOG_INCLUDE_BODIES=0 MAPLE_LOG_BODY_MAX_CHARS=4000 MAPLE_FIREWALL_LOG_DIR=~/.maple/firewall-logs node --test backend/backendB-core-services/gateway-api/service/tests/runtime-dependencies-startup.test.mjs"
)

rows_json="[]"
overall_failures=0

for idx in "${!SUITE_LABELS[@]}"; do
  label="${SUITE_LABELS[$idx]}"
  cmd="${SUITE_COMMANDS[$idx]}"
  pass_count=0
  fail_count=0
  total_duration=0

  echo "[stateful-loop] Suite ${label} (${ITERATIONS} iterations)"
  for ((i=1; i<=ITERATIONS; i++)); do
    start_epoch="$(date +%s)"
    set +e
    (
      cd "${ROOT_DIR}"
      bash -lc "${cmd}"
    )
    rc=$?
    set -e
    end_epoch="$(date +%s)"
    duration=$((end_epoch - start_epoch))
    total_duration=$((total_duration + duration))

    if [ "$rc" -eq 0 ]; then
      pass_count=$((pass_count + 1))
    else
      fail_count=$((fail_count + 1))
      overall_failures=$((overall_failures + 1))
    fi

    rows_json="$(node -e '
      const rows = JSON.parse(process.argv[1]);
      rows.push({ suite: process.argv[2], iteration: Number(process.argv[3]), exitCode: Number(process.argv[4]), durationSec: Number(process.argv[5]) });
      process.stdout.write(JSON.stringify(rows));
    ' "$rows_json" "$label" "$i" "$rc" "$duration")"
  done

  avg_duration=0
  if [ "$ITERATIONS" -gt 0 ]; then
    avg_duration=$((total_duration / ITERATIONS))
  fi

  echo "[stateful-loop] ${label}: pass=${pass_count} fail=${fail_count} avgDurationSec=${avg_duration}"
done

summary_json="$(node -e '
  const rows = JSON.parse(process.argv[1]);
  const iterations = Number(process.argv[2]);
  const generatedAt = new Date().toISOString();
  const suites = new Map();
  for (const row of rows) {
    if (!suites.has(row.suite)) {
      suites.set(row.suite, {
        suite: row.suite,
        iterations,
        passCount: 0,
        failCount: 0,
        totalDurationSec: 0,
        maxDurationSec: 0,
      });
    }
    const aggregate = suites.get(row.suite);
    aggregate.totalDurationSec += Number(row.durationSec || 0);
    aggregate.maxDurationSec = Math.max(aggregate.maxDurationSec, Number(row.durationSec || 0));
    if (Number(row.exitCode) === 0) {
      aggregate.passCount += 1;
    } else {
      aggregate.failCount += 1;
    }
  }
  const suiteSummary = [...suites.values()].map((row) => ({
    ...row,
    avgDurationSec: row.iterations > 0 ? Number((row.totalDurationSec / row.iterations).toFixed(2)) : 0,
    flakeRate: row.iterations > 0 ? Number((row.failCount / row.iterations).toFixed(4)) : 0,
    ok: row.failCount === 0,
  }));
  const payload = {
    artifactSchemaVersion: 1,
    generatedAt,
    iterations,
    ok: suiteSummary.every((row) => row.ok),
    suites: suiteSummary,
    runs: rows,
  };
  process.stdout.write(JSON.stringify(payload, null, 2));
' "$rows_json" "$ITERATIONS")"

printf '%s\n' "$summary_json" > "${SUMMARY_FILE}"

node -e '
const fs = require("node:fs");
const summary = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const lines = [];
lines.push("# Stateful Suite Loop Summary");
lines.push("");
lines.push(`Generated: ${summary.generatedAt}`);
lines.push(`Iterations per suite: ${summary.iterations}`);
lines.push("");
lines.push("| Suite | Pass | Fail | FlakeRate | AvgDuration(s) | MaxDuration(s) |");
lines.push("|---|---:|---:|---:|---:|---:|");
for (const row of summary.suites) {
  lines.push(`| ${row.suite} | ${row.passCount} | ${row.failCount} | ${row.flakeRate} | ${row.avgDurationSec} | ${row.maxDurationSec} |`);
}
fs.writeFileSync(process.argv[2], `${lines.join("\n")}\n`);
' "${SUMMARY_FILE}" "${REPORT_FILE}"

if [ "${overall_failures}" -gt 0 ]; then
  echo "[stateful-loop] FAIL: ${overall_failures} failures observed across suite loops. See ${SUMMARY_FILE}" >&2
  exit 1
fi

echo "[stateful-loop] Completed successfully. Summary: ${SUMMARY_FILE}"
