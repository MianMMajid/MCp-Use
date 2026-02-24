# Maple Monolith

Canonical backend runtime source.

Contains:
- `index.ts`
- `src/`
- `tests/`
- `package.json`
- `tsconfig.json`

Generated at runtime:
- `public/` and `resources/` via `backend/backendA-platform-infra/scripts/sync-runtime-assets.sh`
- `node_modules` symlink to workspace root for `mcp-use` toolchain resolution
