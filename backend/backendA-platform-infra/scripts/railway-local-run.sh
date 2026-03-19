#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/railway-env.sh"

IMAGE_NAME="${MAPLE_RAILWAY_LOCAL_IMAGE:-maple-railway-local}"
SERVICE_INPUT="${1:-}"
shift || true

if [ -z "${SERVICE_INPUT}" ]; then
  cat <<'EOF'
Usage: bash backend/backendA-platform-infra/scripts/railway-local-run.sh <service> [--build] [--no-env] [--port <host-port>]

Services:
  gateway-api | gateway
  context-wall
  mcp-proxy
  cyber-proxy
  audit-writer
  frontendA | frontend-a
  frontendB | frontend-b
  frontendC | frontend-c
  tool-runner
  admin-console | admin-console-api
  model-router

Examples:
  bash backend/backendA-platform-infra/scripts/railway-local-run.sh frontendC --build
  bash backend/backendA-platform-infra/scripts/railway-local-run.sh gateway --port 3000
  bash backend/backendA-platform-infra/scripts/railway-local-run.sh tool-runner --no-env
EOF
  exit 1
fi

HOST_PORT=""
BUILD_IMAGE=0
LOAD_ENV=1

while [ $# -gt 0 ]; do
  case "$1" in
    --build)
      BUILD_IMAGE=1
      shift
      ;;
    --no-env)
      LOAD_ENV=0
      shift
      ;;
    --port)
      HOST_PORT="${2:-}"
      if [ -z "${HOST_PORT}" ]; then
        echo "Missing value for --port" >&2
        exit 1
      fi
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

SERVICE_NAME="$(maple_service_name "${SERVICE_INPUT}")"
MAPLE_SERVICE="$(maple_service_runtime_name "${SERVICE_INPUT}")"
CONTAINER_PORT="$(maple_service_container_port "${SERVICE_INPUT}")"
DEFAULT_HOST_PORT="$(maple_local_host_port "${SERVICE_INPUT}")"

HOST_PORT="${HOST_PORT:-${DEFAULT_HOST_PORT}}"
CONTAINER_NAME="maple-${MAPLE_SERVICE//[^a-zA-Z0-9]/-}-local"

if [ "${LOAD_ENV}" = "1" ] && [ -f "${ROOT_DIR}/.env" ]; then
  maple_load_local_env
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if [ "${BUILD_IMAGE}" = "1" ] || ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  echo "Building ${IMAGE_NAME} from Railway Dockerfile..."
  docker build \
    -f "${ROOT_DIR}/backend/backendA-platform-infra/deploy/Dockerfile.railway" \
    -t "${IMAGE_NAME}" \
    "${ROOT_DIR}"
fi

if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
fi

echo "Running ${SERVICE_NAME} (${MAPLE_SERVICE}) in local Railway container"
echo "  image: ${IMAGE_NAME}"
echo "  host port: ${HOST_PORT}"
echo "  container port: ${CONTAINER_PORT}"
echo "  container name: ${CONTAINER_NAME}"

docker_args=(
  --rm -it
  --name "${CONTAINER_NAME}"
  -p "${HOST_PORT}:${CONTAINER_PORT}"
  -e "PORT=${CONTAINER_PORT}"
  -e "HOST=0.0.0.0"
)

while IFS= read -r kv; do
  [ -n "${kv}" ] || continue
  docker_args+=(-e "${kv}")
done < <(maple_emit_env_file "${SERVICE_INPUT}" local)

exec docker run "${docker_args[@]}" "${IMAGE_NAME}"
