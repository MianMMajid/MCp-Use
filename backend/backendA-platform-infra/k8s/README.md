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
   - `http://localhost:3000` (gateway-api / judge / inspector)
   - `http://localhost:3100` (frontendA-it-console)
   - `http://localhost:3200` (frontendB-desktop-app shell)
   - `http://localhost:3300` (frontendC-marketing-site)
   - `http://localhost:3400` (frontendD-mcp-widgets)
   - `http://localhost:4010/health` (openclaw-bridge)
   - `ws://localhost:4011` (openclaw-gateway)

Teardown:
- Workloads only: `npm run k8s:down`
- Workloads + cluster: `npm run k8s:down -- --destroy-cluster`

Defaults:
- `npm run dev` now runs the full Kubernetes simulation flow (`k8s:all`).
- `npm run start` now runs the full Kubernetes simulation flow (`k8s:all`).
- Legacy direct monolith run is available via `npm run dev:monolith` or `npm run start:monolith`.

Aggregated logs (full Maple simulation stack):
- `npm run k8s:logs`
- Default output file: `backend/backendA-platform-infra/logs/frontend-backend-stream.log`
