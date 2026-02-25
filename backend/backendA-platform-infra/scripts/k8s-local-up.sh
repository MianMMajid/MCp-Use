#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
K8S_DIR="${ROOT_DIR}/backend/backendA-platform-infra/k8s"
DOCKERFILE_PATH="${ROOT_DIR}/backend/backendA-platform-infra/deploy/Dockerfile"
CLUSTER_NAME="${MAPLE_KIND_CLUSTER:-maple-local}"
NAMESPACE="${MAPLE_K8S_NAMESPACE:-maple}"
IMAGE_TAG="${MAPLE_IMAGE_TAG:-maple-local:dev}"

require_cmd() {
  local name="$1"
  if ! command -v "${name}" >/dev/null 2>&1; then
    echo "Missing required command: ${name}"
    exit 1
  fi
}

require_cmd docker
require_cmd kubectl
require_cmd kind

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running."
  echo "Start Docker Desktop, then run this command again."
  exit 1
fi

if ! kind get clusters | grep -Fxq "${CLUSTER_NAME}"; then
  echo "Creating kind cluster: ${CLUSTER_NAME}"
  kind create cluster --name "${CLUSTER_NAME}" --config "${K8S_DIR}/kind-config.yaml"
else
  echo "Reusing existing kind cluster: ${CLUSTER_NAME}"
fi

echo "Building image ${IMAGE_TAG}"
docker build -f "${DOCKERFILE_PATH}" -t "${IMAGE_TAG}" "${ROOT_DIR}"

echo "Loading image into kind: ${IMAGE_TAG}"
kind load docker-image "${IMAGE_TAG}" --name "${CLUSTER_NAME}"

echo "Applying Kubernetes manifests"
kubectl apply -k "${K8S_DIR}" >/dev/null
kubectl -n "${NAMESPACE}" delete deployment maple-monolith --ignore-not-found=true >/dev/null || true

DEPLOYMENTS="$(kubectl -n "${NAMESPACE}" get deployment -l app.kubernetes.io/part-of=maple-stack -o jsonpath='{.items[*].metadata.name}')"
if [ -z "${DEPLOYMENTS}" ]; then
  echo "No deployments found with label app.kubernetes.io/part-of=maple-stack"
  exit 1
fi

echo "Setting deployment images"
for deployment in ${DEPLOYMENTS}; do
  if [ "${deployment}" = "gateway-api" ]; then
    kubectl -n "${NAMESPACE}" set image "deployment/${deployment}" \
      app="${IMAGE_TAG}" \
      openclaw-bridge="${IMAGE_TAG}" >/dev/null
  else
    kubectl -n "${NAMESPACE}" set image "deployment/${deployment}" app="${IMAGE_TAG}" >/dev/null
  fi
done

echo "Restarting deployments"
kubectl -n "${NAMESPACE}" rollout restart deployment -l app.kubernetes.io/part-of=maple-stack >/dev/null

echo "Waiting for deployment rollout"
for deployment in ${DEPLOYMENTS}; do
  kubectl -n "${NAMESPACE}" rollout status "deployment/${deployment}" --timeout=300s
done

echo ""
echo "Cluster status:"
kubectl -n "${NAMESPACE}" get deploy,svc,pods
echo ""
echo "Next step:"
echo "  npm run k8s:pf"
echo ""
echo "Primary app endpoints:"
echo "  http://localhost:3000/judge"
echo "  http://localhost:3000/inspector"
echo "  http://localhost:3100  (frontendA-it-console)"
echo "  http://localhost:3200  (frontendB-desktop-app)"
echo "  http://localhost:3300  (frontendC-marketing-site)"
echo "  http://localhost:3400  (frontendD-mcp-widgets)"
echo "  http://localhost:4010/health  (openclaw-bridge)"
echo "  ws://localhost:4011          (openclaw-gateway)"
echo ""
echo "Local API key:"
echo "  local-demo-key"
