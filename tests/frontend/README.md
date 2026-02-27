# Frontend Test Strategy (Template Runtime)

## Scope
- Frontend A/B/C are tested as template-runtime surfaces (no legacy `landing.html` / `judges.html` / `desktop-ui.js` dependencies).
- Frontend D remains widget-resource based.

## Commands
- `npm run test:frontend:setup`
- `npm run test:frontend:setup:ci`
- `npm run test:frontend:unit`
- `npm run test:frontend:coverage`
- `npm run test:frontend:e2e`
- `npm run test:frontend:flow`

## Unit Coverage Focus
- Template runtime rewrite/config integrity:
  - `next.config` rewrite mapping for `/api/*` and `/admin/api/*`.
- Desktop shell runtime URL wiring:
  - Electron loads `MAPLE_DESKTOP_UI_URL`.
- Template content contracts:
  - A/B/C pages contain expected journey and API references.

## E2E Harness
- Playwright boots Frontend C template runtime directly:
  - command: `npm --prefix frontend/frontendC-marketing-download-site/template-runtime run dev`
- Smoke coverage:
  - Home journey/download render
  - `/login` form render
  - `/register` form render
- Override target app:
  - `FRONTEND_BASE_URL=http://127.0.0.1:4103 npm run test:frontend:e2e`
