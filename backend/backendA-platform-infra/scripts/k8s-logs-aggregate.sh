#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"

NAMESPACE="${MAPLE_K8S_NAMESPACE:-maple}"
LOG_DIR="${ROOT_DIR}/backend/backendA-platform-infra/logs"
LOG_FILE="${MAPLE_K8S_LOG_FILE:-${LOG_DIR}/frontend-backend-stream.log}"

SELECTOR="${MAPLE_K8S_LOG_SELECTOR:-app.kubernetes.io/part-of=maple-stack}"
MAX_LOG_REQUESTS="${MAPLE_K8S_LOG_MAX_REQUESTS:-100}"

mkdir -p "${LOG_DIR}"

{
  echo ""
  echo "===== kubernetes log stream start $(date -u +'%Y-%m-%dT%H:%M:%SZ') ====="
  echo "namespace=${NAMESPACE}"
  echo "selector=${SELECTOR}"
  echo ""
} | tee -a "${LOG_FILE}" >/dev/null

echo "Writing aggregated logs to: ${LOG_FILE}"
echo "Press Ctrl+C to stop."

kubectl -n "${NAMESPACE}" logs -f \
  -l "${SELECTOR}" \
  --all-containers=true \
  --prefix=true \
  --max-log-requests="${MAX_LOG_REQUESTS}" | tee -a "${LOG_FILE}"
