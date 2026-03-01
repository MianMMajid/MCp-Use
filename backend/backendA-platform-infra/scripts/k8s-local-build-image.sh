#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
DOCKERFILE_PATH="${ROOT_DIR}/backend/backendA-platform-infra/deploy/Dockerfile"
IMAGE_TAG="${MAPLE_IMAGE_TAG:-maple-local:dev}"
OPENCLAW_VERSION="${MAPLE_OPENCLAW_VERSION:-2026.2.21-2}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Missing required command: docker"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running."
  echo "Start Docker Desktop, then run this command again."
  exit 1
fi

echo "Building image ${IMAGE_TAG} (OpenClaw ${OPENCLAW_VERSION})"
docker build \
  --build-arg "OPENCLAW_VERSION=${OPENCLAW_VERSION}" \
  -f "${DOCKERFILE_PATH}" \
  -t "${IMAGE_TAG}" \
  "${ROOT_DIR}"
