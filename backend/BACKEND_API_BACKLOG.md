# Backend API Backlog (Vision Completion)

This backlog lists missing APIs needed to move from current MVP coverage to full production-grade backend coverage.
It is prioritized and includes concrete contracts so implementation can start immediately.

For long-range product-complete targets, see:
- `backend/FULL_VISION_API_WISHLIST.md`

## Scope

- External client entrypoint: `gateway-api` (`/api/*`, `/admin/api/*`, `/gpt/*`).
- SaaS system-of-record: `business-api` (`/api/business/*`).
- Core orchestration: context-wall/model-router/mcp-proxy/cyber-proxy/tool-runner (gRPC plane).
- Desktop runtime bridge (`backendD`) remains local runtime control (not HTTP API).

## Priority Model

- `P0`: Required for secure production baseline.
- `P1`: Required for multi-user/team product operation.
- `P2`: Important for scale/ops but can follow P0/P1.

## P0: Security + Billing Lifecycle

### API-001: Forgot Password Request
- Priority: `P0`
- Owner: `backendC-saas-services/business-api`
- Gateway route: `POST /api/auth/forgot-password`
- Business route: `POST /api/business/auth/forgot-password`
- Request:
```json
{
  "email": "user@example.com",
  "redirectUrl": "https://app.example.com/reset-password"
}
```
- Response `200` (always generic, no account enumeration):
```json
{ "ok": true }
```
- Error codes: `400`, `429`
- Notes: send email with single-use token.

### API-002: Reset Password Confirm
- Priority: `P0`
- Owner: `business-api`
- Gateway route: `POST /api/auth/reset-password`
- Business route: `POST /api/business/auth/reset-password`
- Request:
```json
{
  "token": "reset_token",
  "newPassword": "new-strong-password"
}
```
- Response `200`:
```json
{ "ok": true }
```
- Error codes: `400`, `410`, `429`
- Notes: invalidate all active sessions for that user after success.

### API-003: Email Verification Request
- Priority: `P0`
- Owner: `business-api`
- Gateway route: `POST /api/auth/verify-email/request`
- Business route: `POST /api/business/auth/verify-email/request`
- Request:
```json
{ "email": "user@example.com" }
```
- Response `200`:
```json
{ "ok": true }
```
- Error codes: `400`, `429`

### API-004: Email Verification Confirm
- Priority: `P0`
- Owner: `business-api`
- Gateway route: `POST /api/auth/verify-email/confirm`
- Business route: `POST /api/business/auth/verify-email/confirm`
- Request:
```json
{ "token": "verify_token" }
```
- Response `200`:
```json
{ "ok": true }
```
- Error codes: `400`, `410`

### API-005: Billing Invoice History
- Priority: `P0`
- Owner: `business-api`
- Gateway route: `GET /api/billing/invoices?limit=20&cursor=...`
- Business route: `GET /api/business/billing/invoices?limit=20&cursor=...`
- Response `200`:
```json
{
  "ok": true,
  "items": [
    {
      "id": "in_123",
      "status": "paid",
      "amount": 2900,
      "currency": "usd",
      "createdAt": "2026-02-25T00:00:00.000Z",
      "hostedInvoiceUrl": "https://..."
    }
  ],
  "nextCursor": ""
}
```
- Error codes: `401`, `502`

### API-006: Subscription Cancel
- Priority: `P0`
- Owner: `business-api`
- Gateway route: `POST /api/billing/subscription/cancel`
- Business route: `POST /api/business/billing/subscription/cancel`
- Request:
```json
{
  "atPeriodEnd": true
}
```
- Response `200`:
```json
{
  "ok": true,
  "status": "active",
  "cancelAtPeriodEnd": true,
  "currentPeriodEnd": "2026-03-25T00:00:00.000Z"
}
```
- Error codes: `401`, `404`, `502`

### API-007: Subscription Resume
- Priority: `P0`
- Owner: `business-api`
- Gateway route: `POST /api/billing/subscription/resume`
- Business route: `POST /api/business/billing/subscription/resume`
- Request: `{}`  
- Response `200`:
```json
{
  "ok": true,
  "status": "active",
  "cancelAtPeriodEnd": false
}
```
- Error codes: `401`, `404`, `409`, `502`

## P1: Team/Org + API Key Management + Agent Session Control

### API-101: Organization CRUD (minimal)
- Priority: `P1`
- Owner: `business-api`
- Gateway routes:
  - `GET /api/org`
  - `POST /api/org`
  - `PATCH /api/org/:orgId`
- Business routes:
  - `GET /api/business/org`
  - `POST /api/business/org`
  - `PATCH /api/business/org/:orgId`
- Notes: include org role in auth context for policy decisions.

### API-102: Organization Members + Invites
- Priority: `P1`
- Owner: `business-api`
- Gateway routes:
  - `GET /api/org/:orgId/members`
  - `POST /api/org/:orgId/invites`
  - `POST /api/org/invites/:inviteId/accept`
  - `DELETE /api/org/:orgId/members/:userId`
- Business routes mirrored under `/api/business/...`

### API-103: Personal API Keys
- Priority: `P1`
- Owner: `business-api`
- Gateway routes:
  - `GET /api/user/api-keys`
  - `POST /api/user/api-keys`
  - `DELETE /api/user/api-keys/:keyId`
- Business routes mirrored under `/api/business/...`
- Create request:
```json
{
  "name": "local-cli",
  "expiresAt": "2026-06-01T00:00:00.000Z"
}
```
- Create response includes one-time clear token.

### API-104: OpenClaw Session List
- Priority: `P1`
- Owner: `gateway-api` (or dedicated agent service later)
- Route: `GET /api/openclaw/agent/sessions?limit=20&cursor=...`
- Response:
```json
{
  "ok": true,
  "items": [
    {
      "sessionId": "agent:dev:main",
      "status": "running",
      "updatedAt": "2026-02-25T00:00:00.000Z"
    }
  ],
  "nextCursor": ""
}
```

### API-105: OpenClaw Session Cancel
- Priority: `P1`
- Owner: `gateway-api`
- Route: `POST /api/openclaw/agent/sessions/:sessionId/cancel`
- Response:
```json
{ "ok": true }
```

### API-106: OpenClaw Session Event Stream
- Priority: `P1`
- Owner: `gateway-api`
- Route: `GET /api/openclaw/agent/sessions/:sessionId/stream` (SSE)
- Events:
  - `ready`
  - `delta`
  - `tool_call`
  - `done`
  - `error`

## P2: Admin Policy Lifecycle + Export/Reporting

### API-201: Policy Version List + Activate
- Priority: `P2`
- Owner: `admin-console-api` + `context-wall`
- Routes:
  - `GET /admin/api/policies/versions`
  - `POST /admin/api/policies/versions/:versionId/activate`
- Notes: remove ambiguity of using decision APIs for policy inventory.

### API-202: Policy Draft Validate
- Priority: `P2`
- Owner: `admin-console-api` + `context-wall`
- Route: `POST /admin/api/policies/validate`
- Request:
```json
{
  "rules": [{ "id": "rule_1", "effect": "deny", "when": { "tool": "..." } }]
}
```
- Response:
```json
{
  "ok": true,
  "errors": [],
  "warnings": []
}
```

### API-203: Audit Export
- Priority: `P2`
- Owner: `admin-console-api` + `audit-writer`
- Route: `POST /admin/api/audit/export`
- Request:
```json
{
  "since": "2026-02-01T00:00:00.000Z",
  "until": "2026-02-28T23:59:59.999Z",
  "format": "jsonl"
}
```
- Response:
```json
{
  "ok": true,
  "downloadUrl": "https://..."
}
```

## Cross-Cutting Requirements For Every New API

1. Gateway boundary
- External auth routes stay at gateway.
- Business logic source of truth remains business-api.
- Gateway proxies and preserves cookies and mTLS headers.

2. Context propagation
- Include `x-maple-tenant-id`, `x-maple-user-id`, `x-maple-device-id`, `x-maple-session-id` where applicable.

3. Audit events
- Emit audit on all mutating operations and sensitive reads.

4. Contract tests
- Add gateway proxy tests and business-api handler tests for each endpoint.
- Add one end-to-end test per feature flow.

5. Fail-closed cutover
- Keep fallback only in non-required mode.
- In production with `MAPLE_BUSINESS_API_REQUIRED=true`, fail closed if business-api is unavailable.

## Suggested Delivery Order

1. Sprint 1 (`P0`): API-001..API-007
2. Sprint 2 (`P1`): API-101..API-106
3. Sprint 3 (`P2`): API-201..API-203

## Done Criteria

- Endpoint implemented in business-api (or owner service).
- Gateway route exposed (if client-facing).
- Tests: unit + proxy + one e2e flow.
- OpenAPI/README updated.
- Audit emission verified.
- Production toggle/cutover documented.
