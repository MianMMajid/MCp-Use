#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/railway-env.sh"

TARGET="${1:-all}"
REDEPLOY=1

if [ "${2:-}" = "--no-redeploy" ] || [ "${1:-}" = "--no-redeploy" ]; then
  REDEPLOY=0
fi

maple_load_railway_sync_env
maple_require_railway_sync_env

if ! command -v railway >/dev/null 2>&1; then
  echo "railway CLI is required" >&2
  exit 1
fi

SERVICES=(
  maple-frontend-a
  maple-frontend-b
  maple-frontend-c
  maple-gateway
  maple-mcp-proxy
  maple-context-wall
  maple-cyber-proxy
  maple-audit-writer
  maple-tool-runner
  maple-admin-console
  maple-model-router
)

sync_one() {
  local service="$1"
  local cmd=(railway variables --environment staging --service "${service}" --skip-deploys)
  while IFS= read -r kv; do
    [ -n "${kv}" ] || continue
    cmd+=(--set "${kv}")
  done < <(maple_emit_env_file "${service}" railway)
  "${cmd[@]}"
  if [ "${REDEPLOY}" = "1" ]; then
    railway redeploy --service "${service}" -y
  fi
}

if [ "${TARGET}" = "all" ] || [ -z "${TARGET}" ]; then
  for service in "${SERVICES[@]}"; do
    echo "Syncing ${service}"
    sync_one "${service}"
  done
else
  echo "Syncing ${TARGET}"
  sync_one "${TARGET}"
fi
