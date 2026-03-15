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

## Prerequisites

- **Node.js 22+** (`nvm use` reads `.nvmrc` automatically)
- **Docker** (for local PostgreSQL 16 and Redis 7 — auto-provisioned)
- **npm 8+** (ships with Node 22)
- **git** (for repo root detection in scripts)

Optional:
- **OpenClaw CLI** — only needed with `npm run dev:fast:openclaw`

## Quick Start

```bash
npm install
npm run dev
```

This single command:
1. Runs preflight checks (config, TLS certs, contracts)
2. Builds all 8 backend services
3. Starts PostgreSQL and Redis via Docker (auto-provisioned)
4. Generates local TLS certificates
5. Launches the full service mesh + 3 frontend dev servers
6. Waits for all services to be ready (~2-3 minutes on first run)

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

## Technical Debt Evaluation

```bash
bash scripts/run-flake-repetition.sh --iterations 5 --all
bash scripts/run-stateful-suite-loops.sh --iterations 20
node scripts/profile-build-test-hotspots.mjs
node scripts/dependency-security-pass.mjs
node scripts/check-docs-architecture-drift.mjs
node scripts/check-debt-slos.mjs
node scripts/build-debt-register-report.mjs
```

Debt artifacts:

- `artifacts/debt/dependency-security-report.json`
- `artifacts/debt/docs-architecture-drift.json`
- `artifacts/debt/debt-slo-status.json`
- `artifacts/debt/debt-register-report.json`
- `artifacts/matrix/flake-repetition-summary.json`
- `artifacts/matrix/stateful-suite-loop-summary.json`
- `artifacts/matrix/build-test-hotspots.json`

Dependency/security gate policy:

- High/Critical vulnerabilities in active workspaces are merge-blocking.
- Temporary exceptions must be declared in `docs/dependency-security-allowlist.json` with owner + expiry.

## Deployment

### Railway

Multi-service dispatch entrypoint:

- `backend/backendA-platform-infra/deploy/railway-entrypoint.sh`

Railway topology is parity-checked against mesh and K8s via:

- `npm run check:service-topology-parity`

### Northflank

- `backend/backendA-platform-infra/deploy/northflank/template.backend-mesh.json`
- `backend/backendA-platform-infra/deploy/northflank/README.md`

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm run dev` hangs on "waiting for postgres" | Ensure Docker is running: `docker info` |
| Port 5432 or 6379 already in use | Stop existing containers: `docker rm -f maple-dev-postgres maple-dev-redis` |
| Node.js version mismatch | Install correct version: `nvm install && nvm use` |
| Services crash on startup | Check logs: `tail -f .maple/dev-fast/logs/<service>.log` |
| TLS cert errors | Force regeneration: `MAPLE_FORCE_CERT_REGEN=1 npm run dev` |
| Stale processes after crash | Clean up: `npm run local:down` then `npm run dev` |

## Additional Docs

- `docs/repo-topology.md`
- `docs/command-surface.md`
- `docs/release-readiness-checklist.md`
- `docs/lockfile-policy.md`
