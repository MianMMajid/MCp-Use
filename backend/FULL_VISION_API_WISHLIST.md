# Full Vision API Goal Wishlist

This is the long-range API target for Maple across backend A/B/C/D.

Use this as the product-complete wishlist.  
Use `backend/BACKEND_API_BACKLOG.md` as the immediate implementation backlog.

## Goal

Deliver a complete API surface for:
- OpenClaw-first agent runtime (thin-client + longform tasks)
- Firewall policy control and explainability
- Tool execution governance
- Full observability and auditability
- SaaS account/billing/org administration
- Operator/admin control plane

## Service Ownership Model

- Public edge API: `gateway-api` (`/api/*`, `/gpt/*`, `/admin/api/*` passthroughs where appropriate)
- Business system of record: `business-api` (`/api/business/*`)
- Policy authority: `context-wall` (gRPC; gateway/admin exposed as HTTP façade)
- Execution plane: `mcp-proxy`, `tool-runner`, `cyber-proxy` (mostly gRPC/internal)
- Admin plane: `admin-console-api`
- Desktop runtime: `backendD` local runtime control (IPC/local control, not internet API)

## Phase 1: Product-Ready Core (Must Have)

### 1) OpenClaw Agent Control APIs

Gateway routes:
- `GET /api/openclaw/agent/status`
- `POST /api/openclaw/agent/turn`
- `POST /api/openclaw/agent/longform`
- `GET /api/openclaw/agent/sessions`
- `GET /api/openclaw/agent/sessions/:sessionId`
- `POST /api/openclaw/agent/sessions/:sessionId/cancel`
- `GET /api/openclaw/agent/sessions/:sessionId/stream` (SSE)
- `GET /api/openclaw/agent/runs/:runId/artifacts`

Goal outcomes:
- Full lifecycle control for session/run management
- Real-time client streaming for desktop and web surfaces

### 2) Firewall + Policy APIs

Gateway routes:
- `GET /api/firewall/state`
- `POST /api/firewall/decision`
- `POST /api/firewall/chat`
- `POST /api/chat/stream`
- `GET /api/chat/capabilities`
- `POST /api/firewall/preview` (dry-run decision without side effects)
- `GET /api/firewall/rules/effective`

Admin routes:
- `GET /admin/api/policies`
- `POST /admin/api/policies/reload`
- `GET /admin/api/policies/versions`
- `POST /admin/api/policies/versions/:versionId/activate`
- `POST /admin/api/policies/validate`

Goal outcomes:
- Single policy authority visibility
- Deterministic policy rollout/rollback

### 3) HITL APIs

Gateway routes:
- `GET /api/hitl/approvals`
- `GET /api/hitl/approvals/watch` (SSE)
- `POST /api/hitl/approvals/decision`

Admin routes:
- `GET /admin/api/approvals`
- `GET /admin/api/approvals/watch`
- `POST /admin/api/approvals/decision`

Goal outcomes:
- End-to-end approval loop without timeout blind spots

### 4) SaaS Auth + Account APIs

Gateway routes:
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/google/client-id`
- `POST /api/auth/google`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-email/request`
- `POST /api/auth/verify-email/confirm`

Business routes:
- Mirrored under `/api/business/auth/*`

Goal outcomes:
- Full account lifecycle (not only session login)

### 5) Billing APIs

Gateway routes:
- `GET /api/billing/subscription`
- `POST /api/billing/create-checkout-session`
- `POST /api/billing/portal-session`
- `POST /api/billing/webhook`
- `GET /api/billing/invoices`
- `POST /api/billing/subscription/cancel`
- `POST /api/billing/subscription/resume`

Business routes:
- Mirrored under `/api/business/billing/*`

Goal outcomes:
- Full subscription lifecycle and invoice visibility

## Phase 2: Multi-Tenant Team Platform

### 6) Organization + RBAC APIs

Gateway routes:
- `GET /api/org`
- `POST /api/org`
- `PATCH /api/org/:orgId`
- `GET /api/org/:orgId/members`
- `POST /api/org/:orgId/invites`
- `POST /api/org/invites/:inviteId/accept`
- `DELETE /api/org/:orgId/members/:userId`
- `GET /api/org/:orgId/roles`
- `POST /api/org/:orgId/roles/:roleId/assign`

Business routes:
- Mirrored under `/api/business/org/*`

Goal outcomes:
- Real enterprise collaboration and role-based control

### 7) API Key + Service Account APIs

Gateway routes:
- `GET /api/user/api-keys`
- `POST /api/user/api-keys`
- `DELETE /api/user/api-keys/:keyId`
- `GET /api/org/:orgId/service-accounts`
- `POST /api/org/:orgId/service-accounts`
- `POST /api/org/:orgId/service-accounts/:id/keys`
- `DELETE /api/org/:orgId/service-accounts/:id/keys/:keyId`

Goal outcomes:
- Programmatic automation with scoped credentials

### 8) Entitlement + Quota APIs

Gateway routes:
- `GET /api/entitlements`
- `GET /api/usage/summary`
- `GET /api/usage/timeseries`
- `GET /api/limits`
- `POST /api/limits/override` (admin-only)

Goal outcomes:
- Clear product packaging and limit enforcement visibility

## Phase 3: Deep Observability + Operations

### 9) Trace + Run Analytics APIs

Gateway routes:
- `GET /api/traces`
- `GET /api/traces/:traceId`
- `GET /api/traces/search`
- `POST /api/traces/export`
- `GET /api/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/timeline`

Goal outcomes:
- Queryable run/trace exploration for debugging and compliance

### 10) Audit + Compliance APIs

Admin routes:
- `GET /admin/api/audit`
- `POST /admin/api/audit/export`
- `GET /admin/api/audit/schemas`
- `GET /admin/api/compliance/reports`

Goal outcomes:
- Auditable history and exportability for customer/legal requirements

### 11) Runtime Health + Diagnostics APIs

Gateway/Admin routes:
- `GET /health`
- `GET /ready`
- `GET /api/runtime/status`
- `GET /api/runtime/dependencies`
- `GET /api/runtime/diag`
- `GET /api/runtime/logs` (scoped, redacted)

Goal outcomes:
- Faster production incident triage

### 12) Tool Governance APIs

Gateway/Admin routes:
- `GET /api/tools/registry`
- `GET /api/tools/registry/:toolId`
- `POST /api/tools/registry`
- `PATCH /api/tools/registry/:toolId`
- `GET /api/tools/policies`
- `POST /api/tools/policies/validate`
- `GET /api/tools/executions`
- `GET /api/tools/executions/:executionId`

Goal outcomes:
- Controlled, inspectable tool runtime behavior

## Phase 4: Ecosystem + Product Integrations

### 13) GPT/App Surface APIs

Gateway routes:
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/ai-plugin.json`
- `GET /gpt/openapi.json`
- `GET /gpt/oauth/authorize`
- `POST /gpt/oauth/token`
- `POST /gpt/tools/:toolName`

Goal outcomes:
- Stable external integration contracts

### 14) Desktop Runtime Control Surface

BackendD local control goals (IPC-first, optionally local HTTP):
- Runtime start/stop/status
- Runtime logs tail
- Runtime health probe
- Managed mode lifecycle hooks

Goal outcomes:
- Predictable desktop operation and supportability

## Cross-Cutting API Standards

Every new API in this wishlist should enforce:

1. Security
- mTLS where required for service-to-service
- AuthN/AuthZ at gateway/admin boundary
- Sensitive field redaction

2. Context propagation
- `tenantId`, `userId`, `deviceId`, `sessionId`, `traceId` propagation

3. Audit
- Sensitive reads and all writes emit audit events

4. Contract stability
- OpenAPI/proto contract source-of-truth
- Versioning rules and deprecation windows

5. Reliability
- Clear fail-closed behavior in production
- Typed error envelope with machine-readable codes

## Suggested Planning Split

- `M1`: Phase 1 (product-ready)
- `M2`: Phase 2 (multi-tenant platform)
- `M3`: Phase 3 (observability/compliance depth)
- `M4`: Phase 4 (ecosystem polish)
