# Backend Shell

This folder defines backend and platform ownership boundaries.

## Layers
- `backendA-platform-infra`: Kubernetes/OpenClaw/firewall infrastructure and deployment controls.
- `backendB-core-services`: Core MCP firewall and service mesh logic.
- `backendC-saas-services`: SaaS/business backend services (accounts, billing, entitlement APIs).
- `backendD-desktop-runtime-bridge`: Runtime bridge for desktop distribution integration.

## Planning Docs
- Immediate execution backlog: `backend/BACKEND_API_BACKLOG.md`
- Long-range API target: `backend/FULL_VISION_API_WISHLIST.md`
- Ordered milestone board (M1-M4): `backend/FULL_VISION_DELIVERY_BOARD.md`
- Tracker import CSV: `backend/FULL_VISION_TICKET_IMPORT.csv`

## Current Source Mapping
- Core backend runtime source: `backend/backendB-core-services/<service>/service/src/`
- Service artifacts/source boundaries: `backend/backendB-core-services/<service>/service/dist/`
- Shared backend libraries: `backend/backendB-core-services/shared/packages/`
- Canonical proto source: `backend/proto/`
- Generated proto mirrors: `backend/backendB-core-services/contracts/proto/`, `backend/backendB-core-services/proto/`, `backend/backendB-core-services/admin-console-api/proto/`
- SaaS backend services: `backend/backendC-saas-services/*`
- Deployment files: `backend/backendA-platform-infra/deploy/`

## Runtime Policy
- Production is fail-closed by default for dependency readiness and auth bypass guards.
- Startup dependency enforcement:
  - `MAPLE_ENFORCE_STARTUP_DEPENDENCIES=1` enforces hard startup checks.
  - Default is enabled in production, optional in non-production.
- Strict dependency posture:
  - `MAPLE_RUNTIME_STRICT_DEPENDENCIES=1` treats required runtime deps as blocking.
- PostgreSQL is required in runtime:
  - `DATABASE_URL` (or `MAPLE_DATABASE_URL`) must be configured.
- Runtime behavior is fail-closed:
  - No Google/Billing fallback behavior is supported.
  - No degraded database startup mode is supported.
