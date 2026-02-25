# Frontend Shell

This folder defines frontend ownership boundaries for collaboration.

## Surfaces
- `frontendA-it-console`: Internal IT/Ops console UI.
- `frontendB-desktop-app`: Desktop app UI (`.exe`/`.dmg`) and installer UX.
- `frontendC-marketing-download-site`: Public website, onboarding, download pages.
- `frontendD-mcp-widgets`: MCP embedded widgets.

## Current Source Mapping
- IT/Ops + judge/landing pages: `frontend/frontendA-it-console/public/`
- Marketing/download pages: `frontend/frontendC-marketing-download-site/public/`
- MCP widgets: `frontend/frontendD-mcp-widgets/resources/`
- Desktop native packaging/app source: `frontend/frontendB-desktop-app/`.

Runtime note:
- `npm run sync:runtime-assets` copies frontend assets into backend runtime paths under `backend/backendB-core-services/maple-monolith/`.
