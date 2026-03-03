# Maple

Maple is a multi-surface platform for agent orchestration, observability, and safeguards.

## Surface Ownership (A/B/C)

- `frontendB-desktop-app` (Catalyst): orchestration control plane.
- `frontendA-it-console` (Protocol): observability, audit, compliance, safeguards.
- `frontendC-marketing-download-site` (Salient): marketing, onboarding, download CTA.

## Active Service Topology

Active runtime services:

- `gateway-api`
- `admin-console-api`
- `context-wall`
- `mcp-proxy`
- `tool-runner`
- `cyber-proxy`
- `audit-writer`
- `business-api`

Archived retired services:

- `backend/legacy/retired-services/model-router`
- `backend/legacy/retired-services/secrets-broker`

## Quick Start

```bash
npm install
npm run dev
```

Fast local loop (`npm run dev`) starts local dependencies plus gateway, core services, and A/B/C surfaces.

Default local URLs:

- `http://127.0.0.1:3000` (gateway-api)
- `http://127.0.0.1:4101` (frontend A)
- `http://127.0.0.1:4102` (frontend B)
- `http://127.0.0.1:4103` (frontend C)

Stop fast-loop processes:

```bash
npm run local:down
```

## Three-Loop Development Model

### 1) Fast Local Loop (daily coding)

```bash
npm run dev
npm run dev:fast
npm run dev:fast:openclaw
```

`dev:fast:openclaw` enables OpenClaw profile validation and startup helpers.

### 2) K8s Validation Loop (integration realism)

```bash
npm run validate:k8s
npm run validate:k8s -- --full
```

Validation artifacts:

- `artifacts/matrix/k8s-validation-summary.json`
- `artifacts/matrix/k8s-service-utilization-summary.json`

### 3) K8s Release Gate (required before merge/cutover)

```bash
npm run gate:k8s
```

Release-gate artifact:

- `artifacts/matrix/k8s-release-gate-summary.json`

## Matrix, Guards, and CI

Run full matrix locally:

```bash
npm run test:matrix
# equivalent: bash scripts/run-full-matrix.sh --all
```

Primary guards:

```bash
npm run check:repo-hygiene
npm run check:command-surface
npm run check:no-legacy-modifier-endpoints
npm run check:service-topology-parity
```

Branch protection required checks:

- `backend-checks`
- `frontend-tests`
- `k8s-release-gate`

## Live Provider Policy

Policy is conditional-strict:

- If required secrets are present, live-provider matrix runs and gates.
- If secrets are missing, matrix writes `artifacts/matrix/live-suite-skip.json` and continues (unless force-live is enabled).
- PR label `requires-live` forces strict live run behavior in CI.

## Service Audit Commands

```bash
npm run service:audit:inventory
npm run service:audit:callgraph
npm run service:audit:report
npm run check:service-route-coverage
npm run check:service-necessity
npm run check:service-utilization
```

Audit outputs:

- `artifacts/service-audit/service-inventory.json`
- `artifacts/service-audit/static-callgraph.json`
- `artifacts/service-audit/utilization-report.json`
- `artifacts/service-audit/utilization-report.md`

## Deployment

### Railway

Multi-service dispatch entrypoint:

- `backend/backendA-platform-infra/deploy/railway-entrypoint.sh`

Railway topology is parity-checked against mesh and K8s via:

- `npm run check:service-topology-parity`

### Northflank

- `backend/backendA-platform-infra/deploy/northflank/template.backend-mesh.json`
- `backend/backendA-platform-infra/deploy/northflank/README.md`

## Additional Docs

- `docs/repo-topology.md`
- `docs/command-surface.md`
- `docs/release-readiness-checklist.md`
- `docs/lockfile-policy.md`
