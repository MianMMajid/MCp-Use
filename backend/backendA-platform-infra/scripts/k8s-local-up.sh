#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
K8S_DIR="${ROOT_DIR}/backend/backendA-platform-infra/k8s"
CERT_DIR="${ROOT_DIR}/backend/backendA-platform-infra/certs"
CLUSTER_NAME="${MAPLE_KIND_CLUSTER:-maple-local}"
NAMESPACE="${MAPLE_K8S_NAMESPACE:-maple}"
IMAGE_TAG="${MAPLE_IMAGE_TAG:-maple-local:dev}"

SKIP_BUILD=0
SKIP_LOAD=0
SKIP_RESTART=0
WAIT_ONLY=0

while (( $# > 0 )); do
  case "$1" in
    --skip-build)
      SKIP_BUILD=1
      ;;
    --skip-load)
      SKIP_LOAD=1
      ;;
    --skip-restart)
      SKIP_RESTART=1
      ;;
    --wait-only)
      WAIT_ONLY=1
      SKIP_BUILD=1
      SKIP_LOAD=1
      SKIP_RESTART=1
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: bash backend/backendA-platform-infra/scripts/k8s-local-up.sh [--skip-build] [--skip-load] [--skip-restart] [--wait-only]" >&2
      exit 2
      ;;
  esac
  shift
done

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
require_cmd openssl

apply_manifests() {
  local use_service_monitor=1
  if ! kubectl api-resources --api-group=monitoring.coreos.com 2>/dev/null | awk '{print $1}' | grep -Fxq "servicemonitors"; then
    use_service_monitor=0
  fi

  if (( use_service_monitor == 1 )); then
    kubectl apply -k "${K8S_DIR}" >/dev/null
    return 0
  fi

  echo "ServiceMonitor CRD not found; applying core manifests without servicemonitor.yaml"
  kubectl apply -f "${K8S_DIR}/namespace.yaml" >/dev/null
  kubectl apply -f "${K8S_DIR}/configmap.yaml" >/dev/null
  kubectl apply -f "${K8S_DIR}/secret.yaml" >/dev/null
  kubectl apply -f "${K8S_DIR}/pvc.yaml" >/dev/null
  kubectl apply -f "${K8S_DIR}/deployment.yaml" >/dev/null
  kubectl apply -f "${K8S_DIR}/service.yaml" >/dev/null
  kubectl apply -f "${K8S_DIR}/networkpolicy.yaml" >/dev/null
  kubectl apply -f "${K8S_DIR}/rbac.yaml" >/dev/null
  kubectl apply -f "${K8S_DIR}/hpa.yaml" >/dev/null
  kubectl apply -f "${K8S_DIR}/pdb.yaml" >/dev/null
  kubectl apply -f "${K8S_DIR}/ingress.yaml" >/dev/null
}

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

if (( WAIT_ONLY == 0 )); then
  if (( SKIP_BUILD == 0 )); then
    bash "${SCRIPT_DIR}/k8s-local-build-image.sh"
  else
    echo "Skipping docker image build (--skip-build)"
  fi

  if (( SKIP_LOAD == 0 )); then
    bash "${SCRIPT_DIR}/k8s-local-load-image.sh"
  else
    echo "Skipping kind image load (--skip-load)"
  fi

  echo "Generating local TLS certificates"
  bash "${ROOT_DIR}/backend/backendA-platform-infra/scripts/generate-local-certs.sh" >/dev/null

  echo "Ensuring namespace exists"
  kubectl apply -f "${K8S_DIR}/namespace.yaml" >/dev/null

  echo "Applying TLS secret"
  kubectl -n "${NAMESPACE}" create secret generic maple-tls \
    --from-file=tls.crt="${CERT_DIR}/tls.crt" \
    --from-file=tls.key="${CERT_DIR}/tls.key" \
    --from-file=ca.crt="${CERT_DIR}/ca.crt" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null

  echo "Applying Kubernetes manifests"
  apply_manifests

  DEPLOYMENTS="$(kubectl -n "${NAMESPACE}" get deployment -l app.kubernetes.io/part-of=maple-stack -o jsonpath='{.items[*].metadata.name}')"
  if [ -z "${DEPLOYMENTS}" ]; then
    echo "No deployments found with label app.kubernetes.io/part-of=maple-stack"
    exit 1
  fi

  echo "Setting deployment images"
  for deployment in ${DEPLOYMENTS}; do
    if [ "${deployment}" = "postgres" ]; then
      continue
    fi
    if [ "${deployment}" = "openclaw-gateway" ]; then
      continue
    fi
    if [ "${deployment}" = "gateway-api" ]; then
      kubectl -n "${NAMESPACE}" set image "deployment/${deployment}" \
        app="${IMAGE_TAG}" \
        openclaw-bridge="${IMAGE_TAG}" >/dev/null
    else
      kubectl -n "${NAMESPACE}" set image "deployment/${deployment}" app="${IMAGE_TAG}" >/dev/null
    fi
  done

  if (( SKIP_RESTART == 0 )); then
    echo "Restarting deployments"
    kubectl -n "${NAMESPACE}" rollout restart deployment -l app.kubernetes.io/part-of=maple-stack >/dev/null
  else
    echo "Skipping rollout restart (--skip-restart)"
  fi
fi

if [ -z "${DEPLOYMENTS:-}" ]; then
  DEPLOYMENTS="$(kubectl -n "${NAMESPACE}" get deployment -l app.kubernetes.io/part-of=maple-stack -o jsonpath='{.items[*].metadata.name}')"
fi

if [ -z "${DEPLOYMENTS}" ]; then
  echo "No deployments found with label app.kubernetes.io/part-of=maple-stack"
  exit 1
fi

echo "Waiting for deployment rollout"
for deployment in ${DEPLOYMENTS}; do
  if [ "${deployment}" = "openclaw-gateway" ] && [ "${MAPLE_OPENCLAW_AGENT_REQUIRED:-false}" != "true" ]; then
    echo "Skipping rollout wait for optional deployment: ${deployment}"
    continue
  fi
  kubectl -n "${NAMESPACE}" rollout status "deployment/${deployment}" --timeout=300s
done

echo ""
echo "Cluster status:"
kubectl -n "${NAMESPACE}" get deploy,svc,pods
echo ""
echo "Next step:"
echo "  bash backend/backendA-platform-infra/scripts/k8s-local-port-forward.sh"
echo ""
echo "Primary app endpoints:"
echo "  https://localhost:3000/judge"
echo "  https://localhost:3000/inspector"
echo "  http://localhost:3100  (frontendA-it-console)"
echo "  http://localhost:3200  (frontendB-desktop-app)"
echo "  http://localhost:3300  (frontendC-marketing-site)"
echo "  http://localhost:3400  (frontendD-mcp-widgets)"
echo "  https://localhost:4001 (admin-console-api)"
echo "  https://localhost:4009 (business-api)"
echo "  http://localhost:4010/health  (openclaw-bridge)"
echo "  ws://localhost:4011          (openclaw-gateway)"
echo ""
echo "Local API key:"
echo "  local-demo-key"
