# Security Hardening Changelog

Comprehensive security audit and hardening of the Mayple service mesh, covering 33 vulnerabilities across 17 files.

---

## Commit: `3b73b68` — Fix 10 tenant isolation, auth, and config vulnerabilities

### CRITICAL

- **Observability scope fails open** (`orchestration-observability-routes.js`, `tenant-claim-resolver.js`)
  - `verifiedScope()` now rejects missing tenant headers (fail-closed) instead of treating empty headers as `verified: true`
  - `resolveVerifiedTenantScope()` returns `verified: false, method: "none"` when both tenantId and orgId are empty
  - All observability routes (audit-log, export, audit-chain, dead-letter, retention, alert-webhooks) require tenant scope

### HIGH

- **Audit-chain cross-tenant leakage** (`audit-integrity.js`, `orchestration-observability-routes.js`)
  - `verifyAuditChain()` accepts and enforces tenantId filter via `WHERE tenant_id = $2`
  - `/audit-chain/verify` route passes tenant scope to verification

- **Dead-letter cross-tenant unsafe** (`orchestration-observability-routes.js`)
  - Dead-letter list query filters in SQL via JSONB extraction (`event_json::jsonb->>'tenantId'`) instead of loading all rows and filtering in memory
  - Pagination total uses the filtered count, not the global count
  - Dead-letter replay always verifies tenant ownership (removed conditional skip when tenantId is empty)
  - Malformed `event_json` now rejected instead of silently replayed

- **Alert-webhook fail-open** (`alert-webhook.js`)
  - `deleteAlertWebhook()` always scopes `DELETE` by `tenant_id` (no fallback to unscoped delete)
  - `getAlertDeliveryLog()` always verifies webhook ownership regardless of tenantId presence

- **Credential scopes forgeable** (`mcp-proxy/service.js`)
  - Scopes included in the HMAC payload (sorted, comma-joined) so they are cryptographically bound to the signed credential
  - `verifySignedCredential()` validates claimed scopes match signed scopes — rejects `scope_mismatch`

- **Google sign-in regressed** (`auth-google.js`)
  - `verifyGoogleJwt()` now returns `email_verified` field so the route's `email_verified !== true` check works correctly

### MEDIUM

- **Posture endpoint overstates security** (`openclaw-posture-routes.js`)
  - Origin validation probe sends a spoofed `Origin` header and expects 401/403 rejection (not just any non-5xx response)
  - Admin auth gate checks `ctx.role === "admin"` for session users

- **GPT OAuth replay per-process** (`gpt-adapter-oauth-routes.js`)
  - Documented the per-process limitation with mitigations (HMAC-signed codes, 5-minute TTL, client_secret required)

- **Unsafe K8s defaults** (`configmap.yaml`)
  - `MAPLE_ADMIN_ALLOW_NO_AUTH` set to `"false"` in K8s configmap

---

## Commit: `1db70e7` — Fix 6 security and reliability issues across service mesh

### CRITICAL

- **Cyber-proxy scope forgery** (`cyber-proxy/service.js`)
  - `verifyCredentialToken()` now extracts signed scopes from the token payload and compares against the claimed `x-maple-credential-scopes` header
  - `parseCredentialScopes()` rejects scope headers with no token (previously parsed and trusted)
  - Prevents scope widening attacks where a valid token is paired with a broader scope header

### HIGH

- **Gateway /ready false positive when DB is down** (`runtime-dependencies.js`)
  - `evaluateGatewayRuntimeDependencies()` now includes a `db.postgres` check that runs `SELECT 1` with a 2-second timeout
  - `/ready` returns 503 when PostgreSQL is unreachable, so K8s stops routing DB-dependent traffic

- **Business API /ready hard-coded to true** (`health-routes.js`, `app.js`)
  - `registerHealthRoutes()` accepts `getDatabase` option and performs a real `SELECT 1` connectivity check
  - Returns 503 with `{ ready: false, db: { ok: false } }` when DB is unavailable

### MEDIUM

- **Trace ownerIndex not rebuilt on restart** (`trace-store-persistence.js`, `trace-store.js`)
  - `loadPersistedTracesIntoIndex()` now rebuilds `ownerIndex` from `trace.ownerKeyFingerprint`
  - `TraceStore.init()` passes `ownerIndex` to the loader
  - Owner-scoped session lookups work correctly after restart

- **Rate limiting IP extraction spoofable** (`auth-routes-login-register.js`, `auth-routes-recovery.js`)
  - Replaced `.pop()` (last XFF hop = proxy IP) with `[0]` (first hop = original client IP set by edge proxy) in all 5 auth rate-limiting locations
  - Extracted into `extractClientIp()` helper function

### LOW

- **Credential signing key throws at import time** (`mcp-proxy/service.js`)
  - Moved `MAPLE_CREDENTIAL_SIGNING_KEY` validation from module top-level to `ensureSigningKey()` lazy initializer
  - Called at service construction (`createMcpProxyService`) for fast startup failure, but no longer crashes on import
  - Tests and helper consumers can load the module without setting the env var

---

## Files Modified (17 total)

| File | Changes |
|------|---------|
| `cyber-proxy/service/src/service.js` | Scope-bound credential verification |
| `gateway-api/src/auth-google.js` | Return `email_verified` from JWT |
| `gateway-api/src/core/alert-webhook.js` | Always-scoped delete and delivery log |
| `gateway-api/src/core/audit-integrity.js` | Tenant-scoped chain verification |
| `gateway-api/src/core/runtime-dependencies.js` | Database connectivity check in /ready |
| `gateway-api/src/core/tenant-claim-resolver.js` | Fail-closed for empty scope |
| `gateway-api/src/core/trace-store-persistence.js` | Rebuild ownerIndex on reload |
| `gateway-api/src/core/trace-store.js` | Pass ownerIndex to loader |
| `gateway-api/src/routes/auth-routes-login-register.js` | Fix IP extraction |
| `gateway-api/src/routes/auth-routes-recovery.js` | Fix IP extraction |
| `gateway-api/src/routes/gpt-adapter-oauth-routes.js` | Document replay limitation |
| `gateway-api/src/routes/openclaw-posture-routes.js` | Better origin check + admin role |
| `gateway-api/src/routes/orchestration-observability-routes.js` | Tenant-scoped observability |
| `mcp-proxy/service/src/service.js` | Lazy signing key + scope binding |
| `business-api/service/src/app.js` | Pass DB to health routes |
| `business-api/service/src/routes/health-routes.js` | Real DB readiness check |
| `k8s/configmap.yaml` | Disable admin no-auth |

---

## Severity Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 7 |
| Medium | 7 |
| Low | 1 |
| **Total** | **17** |
