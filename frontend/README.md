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

## Template Runtime Commands
- Install all template runtime dependencies: `npm run template:install`
- Run A template runtime (default): `npm run dev:frontendA`
- Run B template runtime (default): `npm run dev:frontendB`
- Run C template runtime (default): `npm run dev:frontendC`
