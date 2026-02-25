#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
CERT_SCRIPT="${SCRIPT_DIR}/generate-local-certs.sh"
CERT_DIR="${ROOT_DIR}/backend/backendA-platform-infra/certs"

bash "${CERT_SCRIPT}" >/dev/null

pass_count=0

run_service() {
  local name="$1"
  local port="$2"
  local entrypoint="$3"
  shift 3

  local log_file
  log_file="$(mktemp "/tmp/maple-${name}.XXXXXX.log")"

  (
    export MAPLE_GRPC_TLS_CERT="${CERT_DIR}/tls.crt"
    export MAPLE_GRPC_TLS_KEY="${CERT_DIR}/tls.key"
    export MAPLE_GRPC_TLS_CA="${CERT_DIR}/ca.crt"
    for kv in "$@"; do
      export "$kv"
    done
    node "${entrypoint}" >"${log_file}" 2>&1 &
    local pid=$!

    local ready=0
    for _ in {1..20}; do
      if ! kill -0 "${pid}" >/dev/null 2>&1; then
        break
      fi
      if grep -qi "listening" "${log_file}"; then
        ready=1
        break
      fi
      sleep 0.25
    done

    kill "${pid}" >/dev/null 2>&1 || true
    wait "${pid}" >/dev/null 2>&1 || true

    if [ "${ready}" != "1" ]; then
      echo "[FAIL] ${name} did not reach listening state"
      echo "--- ${name} logs ---"
      cat "${log_file}"
      return 1
    fi

    echo "[PASS] ${name} booted on port ${port}"
    return 0
  )

  rm -f "${log_file}"
  pass_count=$((pass_count + 1))
}

run_service "context-wall" "19090" \
  "${ROOT_DIR}/backend/backendB-core-services/context-wall/service/src/main.js" \
  "CONTEXT_WALL_PORT=19090"

run_service "model-router" "19100" \
  "${ROOT_DIR}/backend/backendB-core-services/model-router/service/src/main.js" \
  "MODEL_ROUTER_PORT=19100"

run_service "mcp-proxy" "19200" \
  "${ROOT_DIR}/backend/backendB-core-services/mcp-proxy/service/src/main.js" \
  "MCP_PROXY_PORT=19200"

run_service "cyber-proxy" "19300" \
  "${ROOT_DIR}/backend/backendB-core-services/cyber-proxy/service/src/main.js" \
  "CYBER_PROXY_PORT=19300"

run_service "tool-runner" "19400" \
  "${ROOT_DIR}/backend/backendB-core-services/tool-runner/service/src/main.js" \
  "TOOL_RUNNER_PORT=19400"

run_service "secrets-broker" "19500" \
  "${ROOT_DIR}/backend/backendB-core-services/secrets-broker/service/src/main.js" \
  "SECRETS_BROKER_PORT=19500"

run_service "admin-console-api" "19600" \
  "${ROOT_DIR}/backend/backendB-core-services/admin-console-api/service/src/main.js" \
  "ADMIN_CONSOLE_PORT=19600" \
  "MAPLE_ADMIN_TLS_CERT=${CERT_DIR}/tls.crt" \
  "MAPLE_ADMIN_TLS_KEY=${CERT_DIR}/tls.key" \
  "MAPLE_ADMIN_TLS_CA=${CERT_DIR}/ca.crt"

echo "Core service smoke checks passed: ${pass_count}"
