# Backend B: Core Services

Owner: Backend engineer.

This shell represents logical service boundaries for core logic.

Service shells:
- `gateway-api`
- `context-wall`
- `mcp-proxy`
- `cyber-proxy`
- `tool-runner`
- `audit-writer`
- `admin-console-api`
- `business-api` (from `backend/backendC-saas-services/business-api`)

Archived retired services:
- `backend/legacy/retired-services/model-router`
- `backend/legacy/retired-services/secrets-broker`

Canonical implementation locations:
- `<service-name>/service/src/` (canonical source for mesh services)
- `<service-name>/service/dist/` (generated runtime output)
- Canonical proto source: `../proto/` (`backend/proto`)
- Generated proto mirrors: `contracts/proto/`, `./proto/`, and `admin-console-api/proto/`
- `shared/packages/`

Runtime assets:
- `backend/backendA-platform-infra/runtime-assets/public/` and `backend/backendA-platform-infra/runtime-assets/resources/` are generated from `frontend/*` by `backend/backendA-platform-infra/scripts/sync-runtime-assets.sh`.

Service-mesh source-first workflow:
- Bootstrap service sources from historical `dist/`: `npm run mesh:bootstrap:src`
- Build all service `dist/` outputs from `src/`: `npm run mesh:build`
- Generate/update proto mirrors from canonical definitions: `npm run contracts:generate`
- Verify proto mirrors are in sync: `npm run contracts:check`
- Validate backend typing/syntax policy: `npm run typecheck`
- Run backend tests (service-level + infra scripts): `npm test`
