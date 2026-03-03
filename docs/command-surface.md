# Command Surface

Canonical root commands are grouped and budgeted to keep the top-level interface stable.

## Canonical Groups

### `dev:*`

- `npm run dev`
- `npm run dev:fast`
- `npm run dev:fast:openclaw`
- `npm run dev:k8s`

### `validate:*`

- `npm run validate:k8s`

### `gate:*`

- `npm run gate:k8s`

### `test:*`

- `npm run test`
- `npm run test:matrix`
- `npm run test:mesh-services`
- `npm run test:saas-services`
- `npm run test:infra-scripts`
- `npm run test:frontend:flow:ci`
- `npm run test:providers-live:matrix`
- `npm run test:retired-services` (non-gating)

### `check:*`

- `npm run check:repo-hygiene`
- `npm run check:command-surface`
- `npm run check:no-legacy-modifier-endpoints`
- `npm run check:source-backed-packages`
- `npm run check:lockfile-policy`
- `npm run check:deprecated-command-aliases`
- `npm run check:service-topology-parity`
- `npm run check:service-route-coverage`
- `npm run check:service-necessity`
- `npm run check:service-utilization`
- `npm run check:frontendB:surface`
- `npm run check:frontend-warning-budget`

### `service:audit:*`

- `npm run service:audit:inventory`
- `npm run service:audit:callgraph`
- `npm run service:audit:report`

## Governance Rules

- Root script count must remain `<= 60`.
- Enforced by `scripts/check-command-surface.mjs`.
- The full matrix includes this as an explicit stage (`commandSurface`).
- CI workflows also run the command-surface guard directly.

## Deprecation Policy

- Canonical grouped commands are the supported interface.
- Deprecated alias reintroduction is blocked by `check:deprecated-command-aliases`.
- Non-core helper scripts should be invoked directly from `backend/backendA-platform-infra/scripts` and documented there.
