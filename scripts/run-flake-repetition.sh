#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/matrix"
SUMMARY_FILE="${ARTIFACT_DIR}/flake-repetition-summary.json"
REPORT_FILE="${ARTIFACT_DIR}/flake-repetition-summary.md"

ITERATIONS="${FLAKE_LOOP_ITERATIONS:-5}"
MATRIX_ARGS=(--all --no-live)

while (( $# > 0 )); do
  case "$1" in
    --iterations)
      ITERATIONS="$2"
      shift
      ;;
    --backend)
      MATRIX_ARGS=(--backend --no-live)
      ;;
    --frontend)
      MATRIX_ARGS=(--frontend --no-live)
      ;;
    --all)
      MATRIX_ARGS=(--all --no-live)
      ;;
    --with-live)
      MATRIX_ARGS=(--all)
      ;;
    --)
      shift
      MATRIX_ARGS=("$@")
      break
      ;;
    *)
      echo "[flake-repetition] Unknown argument: $1" >&2
      echo "Usage: bash scripts/run-flake-repetition.sh [--iterations N] [--backend|--frontend|--all] [--with-live] [-- <matrix args...>]" >&2
      exit 2
      ;;
  esac
  shift
done

if ! [[ "${ITERATIONS}" =~ ^[0-9]+$ ]] || [ "${ITERATIONS}" -lt 1 ]; then
  echo "[flake-repetition] --iterations must be a positive integer." >&2
  exit 2
fi

mkdir -p "${ARTIFACT_DIR}"

runs_json="[]"
pass_count=0
fail_count=0
flake_marker_count=0

for ((i=1; i<=ITERATIONS; i++)); do
  echo "[flake-repetition] Run ${i}/${ITERATIONS}: bash scripts/run-full-matrix.sh ${MATRIX_ARGS[*]}"
  start_epoch="$(date +%s)"
  set +e
  (
    cd "${ROOT_DIR}"
    bash scripts/run-full-matrix.sh "${MATRIX_ARGS[@]}"
  )
  rc=$?
  set -e
  end_epoch="$(date +%s)"
  duration_sec=$((end_epoch - start_epoch))

  run_summary_src="${ARTIFACT_DIR}/full-matrix-summary.json"
  run_summary_copy="${ARTIFACT_DIR}/full-matrix-summary.run-${i}.json"
  if [ -f "${run_summary_src}" ]; then
    cp "${run_summary_src}" "${run_summary_copy}"
  fi

  run_ok=false
  run_flake=false
  if [ -f "${run_summary_copy}" ]; then
    run_ok="$(node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(Boolean(p.ok)));' "${run_summary_copy}" 2>/dev/null || echo false)"
    run_flake="$(node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(Boolean(p.flakeMarker)));' "${run_summary_copy}" 2>/dev/null || echo false)"
  fi

  if [ "${rc}" -eq 0 ] && [ "${run_ok}" = "true" ]; then
    pass_count=$((pass_count + 1))
  else
    fail_count=$((fail_count + 1))
  fi

  if [ "${run_flake}" = "true" ]; then
    flake_marker_count=$((flake_marker_count + 1))
  fi

  run_json="$(node -e '
    const runIndex = Number(process.argv[1]);
    const exitCode = Number(process.argv[2]);
    const durationSec = Number(process.argv[3]);
    const ok = String(process.argv[4]) === "true";
    const flake = String(process.argv[5]) === "true";
    process.stdout.write(JSON.stringify({ run: runIndex, exitCode, durationSec, ok, flakeMarker: flake }));
  ' "$i" "$rc" "$duration_sec" "$run_ok" "$run_flake")"
  runs_json="$(node -e 'const prev=JSON.parse(process.argv[1]); prev.push(JSON.parse(process.argv[2])); process.stdout.write(JSON.stringify(prev));' "$runs_json" "$run_json")"

done

summary_json="$(node -e '
  const runs = JSON.parse(process.argv[1]);
  const passCount = Number(process.argv[2]);
  const failCount = Number(process.argv[3]);
  const flakeCount = Number(process.argv[4]);
  const generatedAt = new Date().toISOString();
  const durations = runs.map((r) => Number(r.durationSec || 0));
  const totalDurationSec = durations.reduce((acc, value) => acc + value, 0);
  const avgDurationSec = runs.length > 0 ? Number((totalDurationSec / runs.length).toFixed(2)) : 0;
  const maxDurationSec = durations.length > 0 ? Math.max(...durations) : 0;
  const minDurationSec = durations.length > 0 ? Math.min(...durations) : 0;
  const payload = {
    artifactSchemaVersion: 1,
    generatedAt,
    iterations: runs.length,
    matrixCommand: "bash scripts/run-full-matrix.sh",
    matrixArgs: process.argv[5].split("\u001f").filter(Boolean),
    ok: failCount === 0,
    summary: {
      passCount,
      failCount,
      flakeMarkerCount: flakeCount,
      flakeRate: runs.length > 0 ? Number((flakeCount / runs.length).toFixed(4)) : 0,
      totalDurationSec,
      avgDurationSec,
      minDurationSec,
      maxDurationSec
    },
    runs
  };
  process.stdout.write(JSON.stringify(payload, null, 2));
' "$runs_json" "$pass_count" "$fail_count" "$flake_marker_count" "$(printf '%s\x1f' "${MATRIX_ARGS[@]}")")"

printf '%s\n' "$summary_json" > "${SUMMARY_FILE}"

node -e '
const fs = require("node:fs");
const summary = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const lines = [];
lines.push("# Flake Repetition Summary");
lines.push("");
lines.push(`Generated: ${summary.generatedAt}`);
lines.push(`Iterations: ${summary.iterations}`);
lines.push(`Command: ${summary.matrixCommand} ${summary.matrixArgs.join(" ")}`);
lines.push("");
lines.push(`- Pass runs: ${summary.summary.passCount}`);
lines.push(`- Failed runs: ${summary.summary.failCount}`);
lines.push(`- Runs with flakeMarker: ${summary.summary.flakeMarkerCount}`);
lines.push(`- Avg duration (sec): ${summary.summary.avgDurationSec}`);
lines.push(`- Min duration (sec): ${summary.summary.minDurationSec}`);
lines.push(`- Max duration (sec): ${summary.summary.maxDurationSec}`);
lines.push("");
lines.push("| Run | Exit | OK | FlakeMarker | Duration(s) |");
lines.push("|---:|---:|---:|---:|---:|");
for (const row of summary.runs) {
  lines.push(`| ${row.run} | ${row.exitCode} | ${row.ok ? "yes" : "no"} | ${row.flakeMarker ? "yes" : "no"} | ${row.durationSec} |`);
}
fs.writeFileSync(process.argv[2], `${lines.join("\n")}\n`);
' "${SUMMARY_FILE}" "${REPORT_FILE}"

if [ "${fail_count}" -gt 0 ]; then
  echo "[flake-repetition] FAIL: ${fail_count}/${ITERATIONS} runs failed. See ${SUMMARY_FILE}" >&2
  exit 1
fi

echo "[flake-repetition] Completed successfully. Summary: ${SUMMARY_FILE}"
