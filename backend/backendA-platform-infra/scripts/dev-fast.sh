#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
STATE_DIR="${ROOT_DIR}/.maple/dev-fast"
STATE_FILE="${STATE_DIR}/pids.json"

cd "${ROOT_DIR}"

if [ -z "${DEV_FAST_OPENCLAW+x}" ]; then
  if command -v openclaw >/dev/null 2>&1; then
    DEV_FAST_OPENCLAW=1
  else
    DEV_FAST_OPENCLAW=0
  fi
else
  DEV_FAST_OPENCLAW="${DEV_FAST_OPENCLAW}"
fi
SKIP_BOOTSTRAP=0

while (( $# > 0 )); do
  case "$1" in
    --openclaw)
      DEV_FAST_OPENCLAW=1
      ;;
    --skip-bootstrap)
      SKIP_BOOTSTRAP=1
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: bash backend/backendA-platform-infra/scripts/dev-fast.sh [--openclaw] [--skip-bootstrap]" >&2
      exit 2
      ;;
  esac
  shift
done

mkdir -p "${STATE_DIR}"

if [ -f "${STATE_FILE}" ]; then
  if node -e '
const fs = require("node:fs");
const path = process.argv[1];
try {
  const payload = JSON.parse(fs.readFileSync(path, "utf8"));
  const processes = Array.isArray(payload.processes) ? payload.processes : [];
  const running = processes.some((entry) => {
    const pid = Number(entry && entry.pid);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
  });
  process.exit(running ? 0 : 1);
} catch {
  process.exit(1);
}
' "${STATE_FILE}"; then
    echo "Fast loop appears to be running already (state file: ${STATE_FILE})." >&2
    echo "Run: bash backend/backendA-platform-infra/scripts/dev-fast-down.sh" >&2
    exit 1
  fi
fi

if (( SKIP_BOOTSTRAP == 0 )); then
  echo "[dev-fast] Running startup bootstrap (preflight + sync + mesh build)"
  npm run preflight
  npm run sync:runtime-assets
  npm run mesh:build
fi

export DEV_FAST_OPENCLAW
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/env-fast.defaults.sh"

bash "${SCRIPT_DIR}/generate-local-certs.sh" >/dev/null

configure_openclaw_default_model() {
  if [ "${DEV_FAST_OPENCLAW:-0}" != "1" ]; then
    return
  fi
  if ! command -v openclaw >/dev/null 2>&1; then
    return
  fi
  if [ -z "${OPENAI_API_KEY:-}" ] || [ "${OPENAI_API_KEY}" = "ci-test-openai-key" ]; then
    echo "[dev-fast] Skipping OpenClaw OpenAI model seed; no real OPENAI_API_KEY is configured"
    return
  fi

  echo "[dev-fast] Seeding OpenClaw dev profile to openai/gpt-4o"
  if ! openclaw --dev models set openai/gpt-4o >/dev/null 2>&1; then
    echo "[dev-fast] Warning: failed to seed OpenClaw default model to openai/gpt-4o" >&2
  fi
}

is_port_open() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  nc -z 127.0.0.1 "${port}" >/dev/null 2>&1
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required to auto-start local postgres/redis dependencies." >&2
    echo "Install/start Docker or provide running services on ports 5432 and 6379." >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not running." >&2
    echo "Start Docker Desktop and retry." >&2
    exit 1
  fi
}

ensure_postgres() {
  if is_port_open 5432; then
    echo "[dev-fast] Reusing postgres on :5432"
    return
  fi

  require_docker
  if docker ps -a --format '{{.Names}}' | grep -Fxq maple-dev-postgres; then
    echo "[dev-fast] Starting existing postgres container maple-dev-postgres"
    docker start maple-dev-postgres >/dev/null
  else
    echo "[dev-fast] Creating postgres container maple-dev-postgres"
    docker run -d \
      --name maple-dev-postgres \
      -e POSTGRES_USER=maple \
      -e POSTGRES_PASSWORD=maple \
      -e POSTGRES_DB=maple \
      -p 5432:5432 \
      postgres:16-alpine >/dev/null
  fi

  for _ in {1..60}; do
    if docker exec maple-dev-postgres pg_isready -U maple -d maple >/dev/null 2>&1; then
      echo "[dev-fast] Postgres ready on :5432"
      return
    fi
    sleep 1
  done

  echo "[dev-fast] Postgres did not become ready in time." >&2
  exit 1
}

ensure_redis() {
  if is_port_open 6379; then
    echo "[dev-fast] Reusing redis on :6379"
    return
  fi

  require_docker
  if docker ps -a --format '{{.Names}}' | grep -Fxq maple-dev-redis; then
    echo "[dev-fast] Starting existing redis container maple-dev-redis"
    docker start maple-dev-redis >/dev/null
  else
    echo "[dev-fast] Creating redis container maple-dev-redis"
    docker run -d \
      --name maple-dev-redis \
      -p 6379:6379 \
      redis:7-alpine >/dev/null
  fi

  for _ in {1..30}; do
    if docker exec maple-dev-redis redis-cli ping >/dev/null 2>&1; then
      echo "[dev-fast] Redis ready on :6379"
      return
    fi
    sleep 1
  done

  echo "[dev-fast] Redis did not become ready in time." >&2
  exit 1
}

ensure_postgres
ensure_redis
configure_openclaw_default_model

echo "[dev-fast] Launching full local fast stack"
exec node "${SCRIPT_DIR}/dev-fast-stack.mjs"
