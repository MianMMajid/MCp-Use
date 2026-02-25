# Network Policy

This directory stores the backend service-mesh NetworkPolicy set.

Canonical manifest:
- `backend-service-mesh-networkpolicy.yaml`

Runtime wiring:
- The same policy set is applied through `backend/backendA-platform-infra/k8s/networkpolicy.yaml`
- `backend/backendA-platform-infra/k8s/kustomization.yaml` includes that manifest for `kubectl apply -k`.
