#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
STATE_FILE="${ROOT_DIR}/.maple/dev-fast/pids.json"
STOP_DEPS=0

while (( $# > 0 )); do
  case "$1" in
    --stop-deps)
      STOP_DEPS=1
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: bash backend/backendA-platform-infra/scripts/dev-fast-down.sh [--stop-deps]" >&2
      exit 2
      ;;
  esac
  shift
done

if [ -f "${STATE_FILE}" ]; then
  FAST_LOOP_PIDS=()
  while IFS= read -r pid; do
    [ -n "${pid}" ] && FAST_LOOP_PIDS+=("${pid}")
  done < <(node -e '
const fs = require("node:fs");
const file = process.argv[1];
const payload = JSON.parse(fs.readFileSync(file, "utf8"));
const processes = Array.isArray(payload.processes) ? payload.processes : [];
for (const proc of processes) {
  if (!proc) continue;
  const pid = Number(proc.pid);
  if (Number.isFinite(pid) && pid > 0) process.stdout.write(String(pid) + "\n");
}
' "${STATE_FILE}" 2>/dev/null || true)

  if [ "${#FAST_LOOP_PIDS[@]}" -gt 0 ]; then
    echo "[dev-fast-down] Stopping fast-loop process groups"
    for pid in "${FAST_LOOP_PIDS[@]}"; do
      if kill -0 "${pid}" >/dev/null 2>&1; then
        kill -- "-${pid}" >/dev/null 2>&1 || true
      fi
    done
    sleep 1
    for pid in "${FAST_LOOP_PIDS[@]}"; do
      if kill -0 "${pid}" >/dev/null 2>&1; then
        kill -KILL -- "-${pid}" >/dev/null 2>&1 || true
      fi
    done
  fi
  rm -f "${STATE_FILE}"
else
  echo "[dev-fast-down] No state file found at ${STATE_FILE}"
fi

if (( STOP_DEPS == 1 )); then
  if command -v docker >/dev/null 2>&1; then
    echo "[dev-fast-down] Stopping local dependency containers"
    docker stop maple-dev-postgres maple-dev-redis >/dev/null 2>&1 || true
  else
    echo "[dev-fast-down] Docker not installed; skipping dependency container stop."
  fi
fi

echo "[dev-fast-down] Done."
