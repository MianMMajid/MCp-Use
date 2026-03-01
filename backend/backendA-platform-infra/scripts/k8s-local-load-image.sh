#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${MAPLE_KIND_CLUSTER:-maple-local}"
IMAGE_TAG="${MAPLE_IMAGE_TAG:-maple-local:dev}"

if ! command -v kind >/dev/null 2>&1; then
  echo "Missing required command: kind"
  exit 1
fi

if ! kind get clusters | grep -Fxq "${CLUSTER_NAME}"; then
  echo "Kind cluster '${CLUSTER_NAME}' not found."
  echo "Run npm run k8s:up to create it first."
  exit 1
fi

echo "Loading image into kind: ${IMAGE_TAG} -> ${CLUSTER_NAME}"
kind load docker-image "${IMAGE_TAG}" --name "${CLUSTER_NAME}"
