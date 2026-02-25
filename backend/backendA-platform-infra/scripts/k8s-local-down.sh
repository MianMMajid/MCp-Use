#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
CLUSTER_NAME="${MAPLE_KIND_CLUSTER:-maple-local}"
NAMESPACE="${MAPLE_K8S_NAMESPACE:-maple}"
DESTROY_CLUSTER="${MAPLE_K8S_DESTROY_CLUSTER:-false}"

for arg in "$@"; do
  case "${arg}" in
    --destroy-cluster)
      DESTROY_CLUSTER=true
      ;;
  esac
done

if command -v kubectl >/dev/null 2>&1; then
  kubectl delete namespace "${NAMESPACE}" --ignore-not-found=true >/dev/null || true
fi

if [ "${DESTROY_CLUSTER}" = "true" ]; then
  if command -v kind >/dev/null 2>&1; then
    kind delete cluster --name "${CLUSTER_NAME}" || true
  fi
fi

echo "Kubernetes cleanup complete."
echo "  namespace removed: ${NAMESPACE}"
echo "  cluster removed: ${DESTROY_CLUSTER}"
