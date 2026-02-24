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
- `maple-monolith/index.ts`
- `maple-monolith/src/`
- `maple-monolith/tests/`
- `maple-monolith/package.json`
- `maple-monolith/tsconfig.json`
- `<service-name>/service/`
- `contracts/proto/`
- `shared/packages/`

Runtime assets:
- `maple-monolith/public/` and `maple-monolith/resources/` are generated from `frontend/*` by `backend/backendA-platform-infra/scripts/sync-runtime-assets.sh`.
