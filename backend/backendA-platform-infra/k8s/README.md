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
1. `npm run k8s:all`
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
- Local certs are generated automatically during `k8s:up`/`k8s:all`.
- Manual regenerate: `npm run k8s:certs`.

Teardown:
- Workloads only: `npm run k8s:down`
- Workloads + cluster: `npm run k8s:down -- --destroy-cluster`

Defaults:
- `npm run dev` now runs the full Kubernetes stack flow (`k8s:all`).
- `npm run start` now runs the full Kubernetes stack flow (`k8s:all`).

Aggregated logs (full Maple stack):
- `npm run k8s:logs`
- Default output file: `backend/backendA-platform-infra/logs/frontend-backend-stream.log`
