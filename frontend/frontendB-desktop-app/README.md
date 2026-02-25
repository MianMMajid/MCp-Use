# Frontend B: Desktop App

Owner: Frontend engineer.

Purpose:
- Desktop UI and native packaging surface for `.exe/.dmg` distributions.

Folders:
- `app/`
- `installers/`
- `electron/`
- `scripts/`

Runtime bridge source:
- `backend/backendD-desktop-runtime-bridge/bridge/runtime-controller.cjs`
- Synced into `frontend/frontendB-desktop-app/bridge-runtime/` during desktop build/dev.

## Local Commands (from repo root)

Install desktop dependencies:
```bash
npm run desktop:install
```

Run native desktop app:
```bash
npm run desktop:dev
```

Build installers:
```bash
npm run desktop:dist:mac
npm run desktop:dist:win
```

Artifacts:
- `frontend/frontendB-desktop-app/installers/dist/`
- CI automation: `.github/workflows/desktop-packaging.yml` (tag with `desktop-v*`)

Runtime modes:
- Default `external`: app connects to an existing backend at `http://127.0.0.1:3000`.
- Managed mode: set `MAPLE_DESKTOP_RUNTIME_MODE=managed` to allow Start/Stop runtime controls.
