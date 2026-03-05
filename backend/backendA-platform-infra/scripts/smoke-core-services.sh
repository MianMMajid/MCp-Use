#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
CERT_SCRIPT="${SCRIPT_DIR}/generate-local-certs.sh"
CERT_DIR="${ROOT_DIR}/backend/backendA-platform-infra/certs"

bash "${CERT_SCRIPT}" >/dev/null

TMP_PG_CONTAINER=""
TMP_PG_PORT=""

cleanup_tmp_postgres() {
  if [ -n "${TMP_PG_CONTAINER}" ]; then
    docker rm -f "${TMP_PG_CONTAINER}" >/dev/null 2>&1 || true
  fi
}

trap cleanup_tmp_postgres EXIT

if [ -z "${DATABASE_URL:-}" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "[FAIL] DATABASE_URL is unset and docker is unavailable."
    echo "Set DATABASE_URL (PostgreSQL) and rerun, for example:"
    echo "  DATABASE_URL=postgresql://<user>:<pass>@127.0.0.1:5432/<db> npm run test:backend-smoke"
    exit 1
  fi

  TMP_PG_PORT="$(( (RANDOM % 1000) + 55432 ))"
  TMP_PG_CONTAINER="maple-smoke-pg-${TMP_PG_PORT}"

  echo "[info] DATABASE_URL not provided. Starting temporary PostgreSQL container ${TMP_PG_CONTAINER}..."
  docker run -d --rm \
    --name "${TMP_PG_CONTAINER}" \
    -e POSTGRES_USER=maple \
    -e POSTGRES_PASSWORD=maple \
    -e POSTGRES_DB=maple \
    -p "127.0.0.1:${TMP_PG_PORT}:5432" \
    postgres:16-alpine >/dev/null

  ready=0
  for _ in {1..30}; do
    if docker exec "${TMP_PG_CONTAINER}" pg_isready -U maple -d maple >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "${ready}" != "1" ]; then
    echo "[FAIL] Temporary PostgreSQL container failed to become ready."
    exit 1
  fi

  export DATABASE_URL="postgresql://maple:maple@127.0.0.1:${TMP_PG_PORT}/maple"
  echo "[info] Using DATABASE_URL=${DATABASE_URL}"
fi

pass_count=0

run_service() {
  local name="$1"
  local port="$2"
  local entrypoint="$3"
  shift 3

  local log_file
  log_file="$(mktemp "/tmp/maple-${name}.XXXXXX")"

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

run_service "mcp-proxy" "19200" \
  "${ROOT_DIR}/backend/backendB-core-services/mcp-proxy/service/src/main.js" \
  "MCP_PROXY_PORT=19200"

run_service "cyber-proxy" "19300" \
  "${ROOT_DIR}/backend/backendB-core-services/cyber-proxy/service/src/main.js" \
  "CYBER_PROXY_PORT=19300"

echo "Core service smoke checks passed: ${pass_count}"
