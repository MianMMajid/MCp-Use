# Backend Shell

This folder defines backend and platform ownership boundaries.

## Layers
- `backendA-platform-infra`: Kubernetes/OpenClaw/firewall infrastructure and deployment controls.
- `backendB-core-services`: Core MCP firewall and service mesh logic.
- `backendC-desktop-runtime-bridge`: Runtime bridge for desktop distribution integration.

## Current Source Mapping
- Core backend runtime source: `backend/backendB-core-services/maple-monolith/`
- Service artifacts/source boundaries: `backend/backendB-core-services/<service>/`
- Shared backend libraries: `backend/backendB-core-services/shared/packages/`
- Proto/contracts: `backend/backendB-core-services/contracts/proto/`
- Deployment files: `backend/backendA-platform-infra/deploy/`
