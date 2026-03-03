# Collaboration Structure

This repo now has explicit collaboration shells:

- `frontend/`
- `backend/`

## Ownership

- Backend owner: core logic, APIs, services, infra runtime decisions.
- Frontend owner: all UI surfaces (internal console, desktop UI, marketing site, MCP widgets).

## Frontend Breakdown

- `frontend/frontendA-it-console`
- `frontend/frontendB-desktop-app`
- `frontend/frontendC-marketing-download-site`
- `frontend/frontendD-mcp-widgets`

## Backend Breakdown

- `backend/backendA-platform-infra`
- `backend/backendB-core-services`
- `backend/backendC-saas-services`
- `backend/backendD-desktop-runtime-bridge`

## Migration Rule

Do not move active runtime files in one step. Migrate incrementally by feature:
1. Add target module/folder in shell.
2. Move one feature at a time.
3. Keep existing imports/routes working.
4. Validate build/tests before next move.

## Runtime Sync

Frontend assets are sourced from shell folders and synced into backend runtime paths:
- Canonical source: `frontend/frontendA-it-console/template-runtime`
- Canonical source: `frontend/frontendB-desktop-app/template-runtime`
- Canonical source: `frontend/frontendC-marketing-download-site/template-runtime`
- Canonical source: `frontend/frontendD-mcp-widgets/resources`
- Runtime sync target: `backend/backendA-platform-infra/runtime-assets/public` and `backend/backendA-platform-infra/runtime-assets/resources`

Backend runtime files are consumed directly from shell folders:
- `backend/backendB-core-services/<service-name>/service`
- `backend/backendB-core-services/shared/packages`
- `backend/backendB-core-services/contracts/proto`
- `backend/backendC-saas-services/*`
- `backend/backendA-platform-infra/deploy/*`

Use:
1. `npm run sync:runtime-assets`
2. `npm run dev` (fast local loop) or `npm run validate:k8s` (integration realism)
