# Milestone 1 Rollout Guide

## Prerequisites

- Node.js 20+ with `node --test` support
- PostgreSQL 15+ with the `gen_random_uuid()` function
- gRPC services: context-wall (port 9000), audit-writer (port 9400)

## Required Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | **required** |
| `MAPLE_ADMIN_PASSWORD` | Admin password, must be set explicitly in production (no longer has a default) | **required in production** |
| `MAPLE_TENANT_CLAIM_SIGNING_KEY` | Signing key for tenant claims | **required in production** |
| `MAPLE_CREDENTIAL_SIGNING_KEY` | Signing key for MCP credentials | **required in production** |
| `CONTEXT_WALL_ADDRESS` | gRPC address for context-wall | `localhost:9000` |
| `AUDIT_WRITER_ADDRESS` | gRPC address for audit-writer | `localhost:9400` |
| `MAPLE_OPENCLAW_AGENT_ENABLED` | Enable OpenClaw agent routes | `true` |

## Feature Flag Matrix

| Flag | Controls |
|---|---|
| `MAPLE_FIREWALL_ENABLED` | Firewall policy evaluation |
| `MAPLE_OPENCLAW_AGENT_ENABLED` | OpenClaw session APIs |
| `MAPLE_OPENCLAW_MODIFIER_ENABLED` | OpenClaw modifier APIs |
| `MAPLE_ALLOW_NO_AUTH` | Skip auth (dev only, blocked in production) |
| `MAPLE_BUSINESS_API_REQUIRED` | Fail-closed if business-api unavailable |

## M1 Endpoints

| Ticket | Endpoint | Notes |
|---|---|---|
| M1-11 | `GET /api/openclaw/agent/sessions` | Now supports `?status=` and `?agentId=` filters |
| M1-12 | `GET /api/openclaw/agent/sessions/:sessionId` | Now supports `?include=steps,runs` |
| M1-13 | `POST /api/openclaw/agent/sessions/:sessionId/cancel` | Idempotent, returns `alreadyTerminal: true` |
| M1-14 | `GET /api/openclaw/agent/sessions/:sessionId/stream` | `Last-Event-ID` reconnection, keepalive, gap events |
| M1-15 | `GET /api/openclaw/agent/runs/:runId/artifacts` | Content negotiation, artifact metadata |
| M1-16 | `POST /api/firewall/preview` | Dedicated preview, 400/413/503 error handling |
| M1-17 | `GET /api/firewall/rules/effective` | Agent/env filtering, tenant policy enrichment |
| M1-18 | `GET /admin/api/policies/versions` | PostgreSQL primary, in-memory fallback |
| M1-19 | `POST /admin/api/policies/versions/:versionId/activate` | Idempotent, gRPC propagation |
| M1-20 | `POST /admin/api/policies/validate` | Action enum, regex validation, conflict detection |

## Validation Steps

1. Run `node --test backend/backendB-core-services/gateway-api/service/tests/m1-integration.test.mjs`
2. Verify all tests pass
3. Check `MAPLE_ADMIN_PASSWORD` is set in production Railway env
4. Validate ingress with `kubectl kustomize k8s/overlays/staging`
5. Verify network policies with `kubectl diff -f k8s/networkpolicy.yaml`

## Upgrade Path

1. Deploy infra changes (Phase 0) first
2. Set `MAPLE_ADMIN_PASSWORD` explicitly in production
3. Deploy gateway-api with M1 changes
4. Monitor audit events for `AUDIT_EVENT_TYPE_SESSION_CANCELED` and `AUDIT_EVENT_TYPE_POLICY_ACTIVATED`
5. Verify deprecation header on `GET /api/policies/effective` responses

## Troubleshooting

- **503 on firewall/rules/effective**: context-wall gRPC service is unreachable
- **502 on admin/api/policies/versions**: database unavailable, will fallback to in-memory
- **413 on firewall/preview**: request body exceeds 1MB limit
- **Session list empty after filter**: verify sessions have the correct status in database
