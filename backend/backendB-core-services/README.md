# Backend B: Core Services

Owner: Backend engineer.

This shell represents logical service boundaries for core logic.

Service shells:
- `gateway-api`
- `context-wall`
- `model-router`
- `mcp-proxy`
- `cyber-proxy`
- `tool-runner`
- `audit-writer`
- `secrets-broker`
- `admin-console-api`

Canonical implementation locations:
- `<service-name>/service/src/` (canonical source for mesh services)
- `<service-name>/service/dist/` (generated runtime output)
- `contracts/proto/`
- `../proto/` and `./proto/` (runtime copies used by dist services)
- `shared/packages/`

Runtime assets:
- `backend/backendA-platform-infra/runtime-assets/public/` and `backend/backendA-platform-infra/runtime-assets/resources/` are generated from `frontend/*` by `backend/backendA-platform-infra/scripts/sync-runtime-assets.sh`.

Service-mesh source-first workflow:
- Bootstrap service sources from historical `dist/`: `npm run mesh:bootstrap:src`
- Build all service `dist/` outputs from `src/`: `npm run mesh:build`
- Validate backend typing/syntax policy: `npm run typecheck`
- Run backend tests (service-level + infra scripts): `npm test`
