# Repo Topology

## Active Runtime Tree

### Core runtime services

- `backend/backendB-core-services/gateway-api`
- `backend/backendB-core-services/admin-console-api`
- `backend/backendB-core-services/context-wall`
- `backend/backendB-core-services/mcp-proxy`
- `backend/backendB-core-services/tool-runner`
- `backend/backendB-core-services/cyber-proxy`
- `backend/backendB-core-services/audit-writer`

### SaaS runtime services

- `backend/backendC-saas-services/business-api`

### Platform/infra orchestration

- `backend/backendA-platform-infra/scripts`
- `backend/backendA-platform-infra/k8s`
- `backend/backendA-platform-infra/deploy`

### Frontend surfaces

- `frontend/frontendA-it-console`
- `frontend/frontendB-desktop-app`
- `frontend/frontendC-marketing-download-site`
- `frontend/frontendD-mcp-widgets`

## Archived Runtime Tree

Retired services are preserved for audit/rollback context but excluded from active runtime and default CI paths.

- `backend/legacy/retired-services/model-router`
- `backend/legacy/retired-services/secrets-broker`

## Source-of-Truth Topology Contracts

- Service mesh manifest: `backend/backendA-platform-infra/scripts/service-mesh-manifest.mjs`
- K8s deployment: `backend/backendA-platform-infra/k8s/deployment.yaml`
- Railway dispatch: `backend/backendA-platform-infra/deploy/railway-entrypoint.sh`
- Service catalog/scoring: `service-catalog.yaml`

Topology parity is enforced by:

- `npm run check:service-topology-parity`

## Test Selection Contracts

Active mesh tests are manifest-driven via:

- `scripts/run-mesh-service-tests.mjs`

Archived service tests are optional/non-gating via:

- `npm run test:retired-services`
- `scripts/run-retired-service-tests.mjs`
