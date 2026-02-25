#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${MAPLE_K8S_NAMESPACE:-maple}"

kubectl config current-context
echo ""
kubectl get nodes
echo ""
kubectl -n "${NAMESPACE}" get deploy,svc,pods
