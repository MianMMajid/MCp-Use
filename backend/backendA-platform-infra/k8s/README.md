# Local Kubernetes (kind)

This directory contains a runnable multi-workload local Kubernetes stack for Maple.

Included manifests:
- `namespace.yaml`
- `configmap.yaml`
- `secret.yaml`
- `deployment.yaml`
- `service.yaml`
- `kustomization.yaml`
- `kind-config.yaml`

Recommended flow:
1. `npm run dev:k8s` or `npm run validate:k8s`
2. Open:
   - `https://localhost:3000` (gateway-api / judge / inspector)
   - `http://localhost:3100` (frontendA-it-console)
   - `http://localhost:3200` (frontendB-desktop-app shell)
   - `http://localhost:3300` (frontendC-marketing-site)
   - `http://localhost:3400` (frontendD-mcp-widgets)
   - `https://localhost:4001` (admin-console-api)
   - `grpc://localhost:4002..4008` (core gRPC services)
   - `http://localhost:4010/health` (openclaw-bridge)
   - `ws://localhost:4011` (openclaw-gateway)

TLS:
- Local certs are generated automatically during K8s up scripts.
- Manual regenerate: `bash backend/backendA-platform-infra/scripts/generate-local-certs.sh`.

Teardown:
- Workloads only: `bash backend/backendA-platform-infra/scripts/k8s-local-down.sh`
- Workloads + cluster: `bash backend/backendA-platform-infra/scripts/k8s-local-down.sh --destroy-cluster`

Defaults:
- `npm run dev` / `npm run start` run the fast local loop (non-K8s).
- `npm run dev:k8s` runs the full local Kubernetes stack flow.

Aggregated logs (full Maple stack):
- `bash backend/backendA-platform-infra/scripts/k8s-logs-aggregate.sh`
- Default output file: `backend/backendA-platform-infra/logs/frontend-backend-stream.log`
