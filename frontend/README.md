# Frontend Shell

This folder defines frontend ownership boundaries for collaboration.

## Surfaces
- `frontendA-it-console`: Internal IT/Ops console UI.
- `frontendB-desktop-app`: Desktop app UI (`.exe`/`.dmg`) and installer UX.
- `frontendC-marketing-download-site`: Public website, onboarding, download pages.
- `frontendD-mcp-widgets`: MCP embedded widgets.

## Template Mapping
- Frontend A canonical runtime: `frontend/frontendA-it-console/template-runtime/` (Protocol).
- Frontend B canonical runtime: `frontend/frontendB-desktop-app/template-runtime/` (Catalyst).
- Frontend C canonical runtime: `frontend/frontendC-marketing-download-site/template-runtime/` (Salient).

## Structure (No Monolithic HTML Editing)
- Frontend A source: `frontend/frontendA-it-console/template-runtime/src/`
- Frontend B source: `frontend/frontendB-desktop-app/template-runtime/src/`
- Frontend C source: `frontend/frontendC-marketing-download-site/template-runtime/src/`
- Template runtime routes/components are the canonical source.

## Current Source Mapping
- IT/Ops console UI: `frontend/frontendA-it-console/template-runtime/`
- Desktop orchestration UI: `frontend/frontendB-desktop-app/template-runtime/`
- Marketing/download site UI: `frontend/frontendC-marketing-download-site/template-runtime/`
- Desktop native packaging shell: `frontend/frontendB-desktop-app/electron/`
- MCP widgets: `frontend/frontendD-mcp-widgets/resources/`

Runtime note:
- `npm run sync:runtime-assets` copies frontend assets into `backend/backendA-platform-infra/runtime-assets/`.

## Runtime Commands

Canonical root commands:

- Fast local loop (A/B/C + backend services): `npm run dev`
- Fast local loop with OpenClaw profile: `npm run dev:fast:openclaw`
- K8s validation loop: `npm run validate:k8s`
- K8s release gate: `npm run gate:k8s`

Direct per-surface dev commands are intentionally not part of the canonical root script surface.
