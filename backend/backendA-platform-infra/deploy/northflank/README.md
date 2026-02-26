# Northflank Deployment (Maple Full Stack)

This folder contains a Northflank template and helper scripts to deploy the Maple stack from this monorepo.

## Files

- `template.backend-mesh.json`: Northflank template (project + postgres addon + shared build + backend services)
- `render-template.mjs`: regenerates `template.backend-mesh.json`
- `generate-northflank-tls.sh`: creates a TLS bundle with SAN names matching internal service DNS names
- `generate-args.mjs`: builds an arguments override JSON file from certs + env vars

## Services in Template

- `gateway-api` (public)
- `admin-console-api` (public)
- `business-api`
- `context-wall`
- `model-router`
- `mcp-proxy`
- `cyber-proxy`
- `tool-runner`
- `secrets-broker`
- `audit-writer`
- `openclaw-gateway`
- `openclaw-bridge`
- `frontend-a-it-console` (public)
- `frontend-b-desktop-app` (public)
- `frontend-c-marketing-site` (public)
- `frontend-d-mcp-widgets` (public)
- `maple-postgres` addon

## Quick Start

1. Regenerate the template (optional, already committed):

```bash
node backend/backendA-platform-infra/deploy/northflank/render-template.mjs
```

2. Generate TLS material for internal mTLS/TLS:

```bash
bash backend/backendA-platform-infra/deploy/northflank/generate-northflank-tls.sh
```

This writes certs to `backend/backendA-platform-infra/deploy/northflank/certs/`.

3. Create a template arguments file:

```bash
cp backend/backendA-platform-infra/deploy/northflank/.env.northflank.example .env.northflank
# fill .env.northflank, then load it:
set -a; source .env.northflank; set +a

node backend/backendA-platform-infra/deploy/northflank/generate-args.mjs \
  --repo-url https://github.com/<org>/<repo> \
  --repo-branch main \
  --database-url postgresql://<user>:<pass>@<host>:5432/<db> \
  --tls-cert backend/backendA-platform-infra/deploy/northflank/certs/tls.crt \
  --tls-key backend/backendA-platform-infra/deploy/northflank/certs/tls.key \
  --tls-ca backend/backendA-platform-infra/deploy/northflank/certs/ca.crt \
  --output northflank.arguments.json
```

4. In Northflank:

- Import `backend/backendA-platform-infra/deploy/northflank/template.backend-mesh.json`
- Paste/merge values from `northflank.arguments.json` into template arguments
- Run the template

## Important Notes

- `databaseUrl` must be set to a real PostgreSQL DSN.
  The template creates `maple-postgres`, but `databaseUrl` is still explicit so you can choose addon/external DB.
- Runtime strict dependency gates are defaulted to relaxed bootstrap mode:
  - `runtimeStrictDependencies=0`
  - `enforceStartupDependencies=0`
- After all credentials are configured, harden by setting:
  - `runtimeStrictDependencies=1`
  - `enforceStartupDependencies=1`
- Frontend services are configured with API proxying through gateway (`/api`, `/sse`, `/mcp`, `/admin/api`)
  using `static-server.mjs --proxy-target https://gateway-api:8443 --proxy-insecure`.

## Optional Provider Keys

Set these in your environment before running `generate-args.mjs` so they are included automatically:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_TEAM`
- `STRIPE_PRICE_ENTERPRISE`
- `STRIPE_PUBLISHABLE_KEY`
- `GOOGLE_CLIENT_ID`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `SENDGRID_API_KEY` or `RESEND_API_KEY`
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`

## Smoke Checks

After deployment:

- Gateway health: `https://<gateway-public-url>/health`
- Admin health: `https://<admin-public-url>/health`
- Gateway feature capabilities: `https://<gateway-public-url>/api/runtime/feature-capabilities`
