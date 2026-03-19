# Platform Infra Scripts

This directory contains implementation scripts used by canonical root commands.

## Canonical Entry Points

Use root scripts first:

- `npm run dev` / `npm run dev:fast` / `npm run dev:fast:openclaw`
- `npm run validate:k8s`
- `npm run gate:k8s`
- `npm run test:matrix`

## Direct Script Usage (non-core helpers)

These are intentionally not promoted to root aliases.

### K8s helpers

- `bash backend/backendA-platform-infra/scripts/k8s-local-up.sh [--skip-build --skip-load --skip-restart --wait-only]`
- `bash backend/backendA-platform-infra/scripts/k8s-local-down.sh [--destroy-cluster]`
- `bash backend/backendA-platform-infra/scripts/k8s-local-port-forward.sh`
- `bash backend/backendA-platform-infra/scripts/k8s-logs-aggregate.sh`

### Build/sync helpers

- `node backend/backendA-platform-infra/scripts/build-core-services.mjs`
- `bash backend/backendA-platform-infra/scripts/sync-runtime-assets.sh`
- `node backend/backendA-platform-infra/scripts/generate-contract-protos.mjs`
- `node backend/backendA-platform-infra/scripts/check-proto-sync.mjs`

### Deployment helpers

- `bash backend/backendA-platform-infra/deploy/northflank/generate-northflank-tls.sh`
- `node backend/backendA-platform-infra/deploy/northflank/generate-args.mjs`
- `node backend/backendA-platform-infra/deploy/northflank/render-template.mjs`
- `bash backend/backendA-platform-infra/scripts/sync-railway-env.sh all`
- `bash backend/backendA-platform-infra/scripts/railway-local-run.sh gateway --build`

### Railway env standardization

- Local Railway-style runs read `.env`
- Railway sync reads `.env` and then `.env.railway`, with `.env.railway` taking precedence
- Start from `.env.railway.example` when preparing Railway values
- Do not reuse localhost addresses from `.env` for Railway sync

### Legacy/demo helpers

Demo and hackathon scripts in this folder are non-gating and are kept only for local experimentation.
They are not part of required CI release checks.
