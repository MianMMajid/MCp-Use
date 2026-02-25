# Full Vision Delivery Board (M1-M4)

This board converts `backend/FULL_VISION_API_WISHLIST.md` into executable tickets.

## Status Legend

- `todo`: not started
- `in_progress`: active
- `blocked`: waiting on dependency
- `done`: merged + tested

## Global Execution Rules

1. Gateway remains the public API boundary (`/api/*`, `/gpt/*`).
2. Business account/billing/org source-of-truth stays in `backendC business-api`.
3. Policy authority stays in context-wall; gateway/admin expose facades only.
4. Every mutating API emits audit events and includes context propagation.
5. Every ticket must include tests: service + gateway proxy + e2e flow (where applicable).

## M1: Product-Ready Core (Must Have)

### Ordered Tickets

| Order | ID | Title | Owner | Depends On | Est | Status |
|---|---|---|---|---|---|---|
| 1 | M1-01 | Define shared auth recovery contracts (`forgot/reset/verify`) | backendC | - | M | done |
| 2 | M1-02 | Implement business-api `POST /api/business/auth/forgot-password` | backendC | M1-01 | M | done |
| 3 | M1-03 | Implement business-api `POST /api/business/auth/reset-password` | backendC | M1-01 | M | done |
| 4 | M1-04 | Implement business-api `POST /api/business/auth/verify-email/request` | backendC | M1-01 | M | done |
| 5 | M1-05 | Implement business-api `POST /api/business/auth/verify-email/confirm` | backendC | M1-01 | M | done |
| 6 | M1-06 | Add gateway proxies for auth recovery endpoints (`/api/auth/*`) | backendB gateway | M1-02,M1-03,M1-04,M1-05 | S | done |
| 7 | M1-07 | Add business-api billing invoice history endpoint | backendC | - | M | done |
| 8 | M1-08 | Add business-api subscription cancel endpoint | backendC | - | M | done |
| 9 | M1-09 | Add business-api subscription resume endpoint | backendC | - | M | done |
| 10 | M1-10 | Add gateway billing proxies for invoice/cancel/resume | backendB gateway | M1-07,M1-08,M1-09 | S | done |
| 11 | M1-11 | Add OpenClaw session list endpoint (`GET /api/openclaw/agent/sessions`) | backendB gateway | - | M | todo |
| 12 | M1-12 | Add OpenClaw session detail endpoint (`GET /api/openclaw/agent/sessions/:sessionId`) | backendB gateway | M1-11 | S | todo |
| 13 | M1-13 | Add OpenClaw session cancel endpoint (`POST .../:sessionId/cancel`) | backendB gateway | M1-11 | S | todo |
| 14 | M1-14 | Add OpenClaw session stream endpoint (`GET .../:sessionId/stream`) | backendB gateway | M1-11 | M | todo |
| 15 | M1-15 | Add OpenClaw run artifacts endpoint (`GET /api/openclaw/agent/runs/:runId/artifacts`) | backendB gateway | M1-11 | M | todo |
| 16 | M1-16 | Add firewall dry-run simulation endpoint (`POST /api/firewall/simulate`) | backendB gateway + context-wall | - | M | todo |
| 17 | M1-17 | Add effective firewall rules endpoint (`GET /api/firewall/rules/effective`) | backendB admin+gateway | M1-16 | S | todo |
| 18 | M1-18 | Add admin policies versions list endpoint (`GET /admin/api/policies/versions`) | backendB admin | - | M | todo |
| 19 | M1-19 | Add admin policies activate endpoint (`POST /admin/api/policies/versions/:versionId/activate`) | backendB admin + context-wall | M1-18 | M | todo |
| 20 | M1-20 | Add admin policies validate endpoint (`POST /admin/api/policies/validate`) | backendB admin + context-wall | M1-18 | M | todo |
| 21 | M1-21 | M1 contract + integration tests (auth recovery, billing lifecycle, openclaw sessions, policy versioning) | backendB+backendC | M1-06,M1-10,M1-15,M1-20 | L | todo |
| 22 | M1-22 | M1 rollout docs + env flags + fail-closed behavior update | backendA+backendB+backendC | M1-21 | M | todo |

### M1 Exit Criteria

- All M1 endpoints available via gateway where client-facing.
- Business-api source-of-truth endpoints implemented and covered by tests.
- `MAPLE_BUSINESS_API_REQUIRED=true` path fully fail-closed for M1 auth/billing routes.

## M2: Multi-Tenant Team Platform

### Ordered Tickets

| Order | ID | Title | Owner | Depends On | Est | Status |
|---|---|---|---|---|---|---|
| 1 | M2-01 | Define org model + RBAC contract (roles, membership, invite lifecycle) | backendC | M1-22 | M | todo |
| 2 | M2-02 | Implement business-api org CRUD (`/api/business/org*`) | backendC | M2-01 | L | todo |
| 3 | M2-03 | Implement business-api org members endpoints | backendC | M2-02 | M | todo |
| 4 | M2-04 | Implement business-api invite issue/accept endpoints | backendC | M2-02 | M | todo |
| 5 | M2-05 | Implement business-api RBAC assignment endpoints | backendC | M2-02 | M | todo |
| 6 | M2-06 | Add gateway proxies for org/member/invite/rbac endpoints | backendB gateway | M2-03,M2-04,M2-05 | M | todo |
| 7 | M2-07 | Define API-key and service-account contracts | backendC | M2-01 | M | todo |
| 8 | M2-08 | Implement business-api personal API key lifecycle endpoints | backendC | M2-07 | M | todo |
| 9 | M2-09 | Implement business-api service account + key lifecycle endpoints | backendC | M2-07 | L | todo |
| 10 | M2-10 | Add gateway proxies for API key and service-account endpoints | backendB gateway | M2-08,M2-09 | M | todo |
| 11 | M2-11 | Implement entitlement + limit computation backend contracts | backendC | M2-01 | M | todo |
| 12 | M2-12 | Implement business-api usage summary/timeseries endpoints | backendC | M2-11 | L | todo |
| 13 | M2-13 | Implement gateway entitlements/usage/limits endpoints | backendB gateway | M2-12 | M | todo |
| 14 | M2-14 | Add admin override endpoint for limits (`POST /api/limits/override`) | backendB admin + backendC | M2-13 | M | todo |
| 15 | M2-15 | M2 integration tests (org, invites, rbac, key lifecycle, quotas) | backendB+backendC | M2-14 | L | todo |
| 16 | M2-16 | M2 migration notes + tenant context propagation validation | backendA+backendB+backendC | M2-15 | M | todo |

### M2 Exit Criteria

- Multi-tenant identity and authorization APIs are production usable.
- API key + service-account automation path exists.
- Entitlements and usage endpoints are stable and test-covered.

## M3: Observability + Compliance + Governance

### Ordered Tickets

| Order | ID | Title | Owner | Depends On | Est | Status |
|---|---|---|---|---|---|---|
| 1 | M3-01 | Define trace/run search and export contracts | backendB | M2-16 | M | todo |
| 2 | M3-02 | Implement `GET /api/traces/search` with filters/pagination | backendB gateway | M3-01 | M | todo |
| 3 | M3-03 | Implement `POST /api/traces/export` (json/jsonl) | backendB gateway | M3-01 | M | todo |
| 4 | M3-04 | Implement runs index endpoint (`GET /api/runs`) | backendB gateway | M3-01 | M | todo |
| 5 | M3-05 | Implement run detail endpoint (`GET /api/runs/:runId`) | backendB gateway | M3-04 | S | todo |
| 6 | M3-06 | Implement run timeline endpoint (`GET /api/runs/:runId/timeline`) | backendB gateway | M3-05 | M | todo |
| 7 | M3-07 | Add admin audit export endpoint (`POST /admin/api/audit/export`) | backendB admin + audit-writer | M3-01 | M | todo |
| 8 | M3-08 | Add admin audit schemas endpoint (`GET /admin/api/audit/schemas`) | backendB admin | M3-07 | S | todo |
| 9 | M3-09 | Add compliance report endpoint (`GET /admin/api/compliance/reports`) | backendB admin | M3-07 | M | todo |
| 10 | M3-10 | Add runtime dependencies endpoint (`GET /api/runtime/dependencies`) | backendB gateway | - | S | todo |
| 11 | M3-11 | Add runtime diagnostics endpoint (`GET /api/runtime/diag`) | backendB gateway | M3-10 | M | todo |
| 12 | M3-12 | Add runtime logs endpoint (`GET /api/runtime/logs`) with redaction/guardrails | backendB gateway | M3-10 | M | todo |
| 13 | M3-13 | Define tool governance registry/policy/execution contracts | backendB | M3-01 | M | todo |
| 14 | M3-14 | Implement `GET/POST/PATCH /api/tools/registry*` | backendB gateway | M3-13 | L | todo |
| 15 | M3-15 | Implement `GET /api/tools/policies` and `POST /api/tools/policies/validate` | backendB gateway + context-wall | M3-13 | M | todo |
| 16 | M3-16 | Implement `GET /api/tools/executions` and `GET /api/tools/executions/:executionId` | backendB gateway | M3-13 | M | todo |
| 17 | M3-17 | M3 observability/compliance/governance integration tests | backendA+backendB | M3-16 | L | todo |

### M3 Exit Criteria

- Search/export/diagnostics endpoints support production debugging.
- Audit/compliance export path is operational.
- Tool governance APIs are queryable and policy-validated.

## M4: Ecosystem + Desktop + Hardening

### Ordered Tickets

| Order | ID | Title | Owner | Depends On | Est | Status |
|---|---|---|---|---|---|---|
| 1 | M4-01 | Validate and version GPT/OpenAPI surface parity | backendB gateway | M3-17 | M | todo |
| 2 | M4-02 | Add GPT surface compatibility tests (plugin manifest + oauth + tools) | backendB gateway | M4-01 | M | todo |
| 3 | M4-03 | Define backendD local control contract (IPC schema + optional local HTTP) | backendD | M3-17 | M | todo |
| 4 | M4-04 | Implement backendD runtime status/start/stop/logs contract stabilization | backendD | M4-03 | M | todo |
| 5 | M4-05 | Wire desktop app to OpenClaw session/run APIs (not only `/judge` and `/health`) | frontendB + backendB | M1-15,M4-04 | L | todo |
| 6 | M4-06 | Add desktop e2e runtime + API communication tests | frontendB + backendD + backendB | M4-05 | L | todo |
| 7 | M4-07 | Global API error envelope normalization pass | backendB+backendC+backendD | M4-02,M4-06 | M | todo |
| 8 | M4-08 | Global audit coverage gap closure pass | backendB+backendC | M4-07 | M | todo |
| 9 | M4-09 | Publish versioned API docs and deprecation policy | backendB+backendC | M4-08 | M | todo |
| 10 | M4-10 | Final full-system API simulation run + signoff | backendA+backendB+backendC+backendD | M4-09 | L | todo |

### M4 Exit Criteria

- Desktop and external integrations consume stable contracts.
- API behavior and error envelopes are consistent across services.
- Full simulation pass is green.

## Start Now Queue (Immediate)

1. `M1-01` shared auth recovery contracts
2. `M1-02`..`M1-05` business-api auth recovery endpoints
3. `M1-06` gateway auth recovery proxies
4. `M1-07`..`M1-10` billing lifecycle completion
5. `M1-11`..`M1-15` OpenClaw session/run lifecycle APIs

## Tracking Fields (for project tooling)

Use these fields for each ticket:
- `id`
- `milestone`
- `owner`
- `status`
- `priority`
- `depends_on`
- `estimate`
- `api_surface`
- `tests_required`
- `rollout_flag`
