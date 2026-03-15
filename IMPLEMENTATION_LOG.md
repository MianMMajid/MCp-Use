# Implementation Log

Detailed record of all changes implemented across the gateway-api service mesh — covering security hardening, performance optimization, inter-service bug fixes, and frontend cleanup.

---

## Table of Contents

- [Security Hardening Round 1 — 22 Critical/High Vulnerabilities](#security-hardening-round-1--22-criticalhigh-vulnerabilities)
- [Security Hardening Round 2 — 11 Residual Findings](#security-hardening-round-2--11-residual-findings)
- [Security Hardening Round 2.5 — 12 Follow-Up Findings](#security-hardening-round-25--12-follow-up-findings)
- [Security Hardening Round 3 — 10 Verified Findings](#security-hardening-round-3--10-verified-findings)
- [Inter-Service Bug Fixes — 28 Issues](#inter-service-bug-fixes--28-issues)
- [Performance & Interconnectivity — 20 Issues](#performance--interconnectivity--20-issues)
- [Remaining Performance & Interconnectivity](#remaining-performance--interconnectivity)
- [Frontend Cleanup](#frontend-cleanup)
- [Files Modified Summary](#files-modified-summary)

---

## Security Hardening Round 1 — 22 Critical/High Vulnerabilities

**Commit:** `4cf8934`

### Phase 1 — Authentication

| # | Finding | Fix |
|---|---------|-----|
| 1 | GPT OAuth accepted any redirect_uri | Validate redirect_uri against configurable allowlist of origins |
| 2 | Auth codes had no TTL, stored insecurely | Store auth codes with 5-minute TTL, auto-cleanup expired entries |
| 3 | Token endpoint didn't require client credentials | Require both `client_id` and `client_secret` on every token exchange |
| 4 | Access tokens were raw API keys | Generate opaque, random access tokens instead of exposing real keys |
| 5 | GPT plugin declared `auth.type: "none"` | Changed to `"oauth"`, added bearer auth to OpenAPI security schemes |
| 6 | GPT tool dispatch had no auth check | Require and verify bearer token before dispatching any tool call |
| 7 | RBAC not enforced on org endpoints | Added `requireOrgRole()` — invites/members/keys require admin+, role assignment requires owner, validate roleId against DEFAULT_ROLES, prevent self-role-escalation |
| 8 | Org invite acceptance had no email check | `acceptOrganizationInvite()` verifies caller email matches invite email |
| 9 | Limits override only needed a session | Require admin-level API key authentication |
| 10 | Google sign-in accepted unverified emails | Reject tokens where `email_verified === false` |
| 11 | `effectiveAllowNoAuth()` returned true in prod | Returns false when `NODE_ENV === "production"` |

### Phase 2 — Tenant Isolation

| # | Finding | Fix |
|---|---------|-----|
| 12 | Tenant claim signing key fell back to `"default"` | `signTenantClaim` throws if signing key is not configured |
| 13 | `hasActiveBinding` returned true when DB unavailable | Returns false (fail-closed) when database pool is unavailable |
| 14 | Audit events used spoofable headers for identity | Use authenticated identity from `authContextStorage` instead of `x-user-id`/`x-tenant-id` headers |

### Phase 3 — Step-Up Auth

| # | Finding | Fix |
|---|---------|-----|
| 15 | Step-up challenges were pre-verified on creation | Insert with `verified_at = NULL`; only set on successful verification |
| 16 | Step-up verification had no tenant scope | Add `tenant_id`/`org_id` to WHERE clause in verify query |
| 17 | `hasValidStepUp` didn't check consumption status | Add `used_for_approval_id IS NULL` and `verified_at IS NOT NULL` filters |

### Phase 4 — Rate Limiting

| # | Finding | Fix |
|---|---------|-----|
| 18 | IP extraction used leftmost x-forwarded-for (spoofable) | Extract rightmost entry (nearest trusted proxy) for login, register, and password recovery |

### Phase 5 — Data Durability

| # | Finding | Fix |
|---|---------|-----|
| 19 | `enqueueAuditEvent` reported success before DB write | Await INSERT before returning `queued: true` |
| 20 | `flushOutbox` could double-deliver events | Use `FOR UPDATE SKIP LOCKED` to prevent concurrent processing |
| 21 | Leader election advisory lock used random pool connection | Bind lock to dedicated PG client session |
| 22 | Workers crashed when DB init failed | Pass null database gracefully; use `mapleLog` instead of `console.error` for trace persistence |

### Phase 6 — Cleanup

- Stub DELETE routes return 501 instead of `{ ok: true }`
- Admin static routes read cookie name from config
- Updated tests for async `enqueueAuditEvent` and `DEADLINE_EXCEEDED` gRPC code

**Files changed:** 21 | **Insertions:** 383 | **Deletions:** 113

---

## Security Hardening Round 2 — 11 Residual Findings

**Commit:** `e5afdf6`

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | HIGH | OAuth redirect_uri used `startsWith` (prefix attack) | Use `URL.origin` comparison — immune to path/query prefix attacks |
| 2 | HIGH | No PKCE support on GPT OAuth | Implement S256 `code_challenge`/`code_verifier` flow |
| 3 | HIGH | In-memory token store doesn't work cross-pod | Replace with HMAC-signed self-validating tokens (no shared store needed) |
| 4 | HIGH | Approval listing didn't enforce tenant isolation | Fail-closed on empty `tenantId` — return empty results |
| 5 | HIGH | Step-up verification lacked tenant/org scope | Include tenant/org scope in both modifier and orchestration verification routes |
| 6 | HIGH | Raw `x-tenant-id`/`x-org-id` headers trusted | Replace with verified tenant claim resolution via `resolveVerifiedTenantScope()` |
| 7 | HIGH | `/health` returned 503 during startup | `/health` liveness probe always returns 200; `/ready` returns 503 when not ready |
| 8 | MEDIUM | Admin `allowNoAuth` not gated by environment | Gated with `NODE_ENV !== "production"` check |
| 9 | MEDIUM | Plaintext `retired:` tokens in mcp-proxy | HMAC-signed credentials replace plaintext tokens |
| 10 | MEDIUM | Trace persistence silently failed | Added 3-attempt retry (100ms delay) with structured error logging |
| 11 | MEDIUM | Stub routes had no auth middleware | Gated with `requireApiKeyResponse` auth middleware |

**Files changed:** 9 | **Insertions:** 169 | **Deletions:** 67

---

## Security Hardening Round 2.5 — 12 Follow-Up Findings

**Commit:** `1fa42eb`

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | CRITICAL | Break-glass review had no tenant scope or self-review prevention | Scoped by tenant/org; self-review blocked in `escalation-chain.js` |
| 2 | HIGH | Escalation history readable cross-tenant | Scoped by tenant/org to prevent cross-tenant reads |
| 3 | HIGH | Modifier approval detail didn't fail-closed on empty scope | Returns empty when actor scope is empty |
| 4 | HIGH | Outbox claiming was non-atomic | Pinned client + explicit transaction for atomic SELECT FOR UPDATE → deliver → ack |
| 5 | HIGH | Credential verification not exported for cyber-proxy | Exported HMAC verification function from `mcp-proxy/service.js` |
| 6 | HIGH | Admin no-auth bypass only guarded at call site | Guarded at middleware level |
| 7 | MEDIUM | GPT OAuth form-encoded token path double-read | Check content-type before body consumption |
| 8 | MEDIUM | GPT OAuth auth codes were pod-local | HMAC-signed codes (cross-pod safe, no shared store) |
| 9 | MEDIUM | Trace persistence `.catch()` swallowed errors | Errors now observed and logged |
| 10 | MEDIUM | Orchestration step-up used raw header scope | Uses verified tenant scope |
| 11 | MEDIUM | Tenant claim header name inconsistent | `x-maple-tenant-claim` is canonical; `x-tenant-claim-signature` accepted as fallback |
| 12 | MEDIUM | Leader election ran on all pods without DB | Skips work when no DB pool instead of running everywhere |

**Files changed:** 11 | **Insertions:** 297 | **Deletions:** 140

---

## Security Hardening Round 3 — 10 Verified Findings

**Commit:** `8be0b6c`

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | CRITICAL | Tenant claims replayable forever after unbind — `signTenantClaim()` had no expiry; `resolveVerifiedTenantScope()` returned verified on valid signature without checking DB binding | Claims now embed `iat` timestamp with 5-minute default expiry. Signature verification rejects expired claims. `resolveVerifiedTenantScope()` **always** checks DB binding — signature supplements but never bypasses the binding check. Legacy (no-timestamp) signatures rejected. |
| 2 | HIGH | Step-up body override + verify/consume race — `body.tenantId` overrode verified scope in challenge creation; `verifyStepUpChallenge` and `consumeStepUpForApproval` were split allowing one challenge to authorize multiple approvals | Removed body override — always uses `headerScope.tenantId`/`orgId`. `verifyStepUpChallenge()` requires `tenantId` (returns `scope_required` if missing). Atomically sets `verified_at` + `used_for_approval_id = 'pending'` in single CAS UPDATE. `consumeStepUpForApproval()` transitions from `'pending'` to actual `approvalId`. `hasValidStepUp()` also requires `tenantId`. |
| 3 | HIGH | Observability routes globally readable/unscoped — used raw `scopeFromHeaders()` with no tenant filters on audit log, dead-letter, retention, and alert webhook endpoints | Replaced all `scopeFromHeaders()` with `verifiedScope()` using `resolveVerifiedTenantScope`. Added tenant filters to: audit-log queries (`replayAuditEvents`), dead-letter list (client-side filter on `event_json` tenantId), dead-letter replay (ownership check before replay), retention endpoints, alert webhook list/create/delete/delivery-log. |
| 4 | HIGH | Audit chain eventId fork + non-atomic insert — `emitAuditEvent()` and `enqueueAuditEvent()` each generated separate eventIds; `appendToAuditChain()` read previous hash and inserted without transaction | Single `eventId` generated in `emitAuditEvent()`, passed to both `enqueueAuditEvent()` and `appendToAuditChain()`. `enqueueAuditEvent()` uses caller-provided eventId (falls back to `randomUUID()`). `appendToAuditChain()` wrapped in transaction with `FOR UPDATE` on previous row to prevent concurrent hash chain forks. |
| 5 | HIGH | Policy-plane context caller-spoofable — middleware stored raw `x-tenant-id` into request context; `firewall-chat-routes.js` accepted `body.tenantId`/`body.userId`; `redirect-routes.js` fed raw headers into context-wall | Middleware marks `tenantVerified: false` on stored context. `firewall-chat-routes.js` ignores `body.tenantId` and `body.userId` — uses `resolveVerifiedTenantScope` for tenant, auth context for user. `redirect-routes.js` uses `resolveVerifiedTenantScope` instead of raw `x-tenant-id`; uses auth context instead of `x-user-id`. |
| 6 | HIGH | Google sign-in bypassed self-signup — auto-created users without checking `allowSelfSignup` or `email_verified` from Google JWT | Checks `email_verified === true` from Google JWT payload (rejects with 403 if not). Checks `allowSelfSignup` config before auto-creating new users (rejects with 403 if disabled). |
| 7 | MEDIUM | GPT OAuth redirect_uri not required on token exchange — only checked mismatch `if (redirectUri && ...)`, didn't require it per RFC 6749 §4.1.3 | Always compares `codeEntry.redirectUri !== (redirectUri ?? "")` — empty redirect_uri must match empty stored value. |
| 8 | MEDIUM | Auth throttle spoofable + verify-email unthrottled — `/api/auth/verify-email/request` had no rate limiting | Added rate limiting to verify-email endpoint using existing `checkRecoveryRateLimit` (5 attempts per 15-minute window, keyed by IP). |
| 9 | MEDIUM | Platform role assignment + limits override privilege gaps — role assignment created membership without user existence check; limits override had no role-based authorization | Role assignment verifies target `userId` exists via `database.findUserById()` (returns 404 if not). Limits override requires `ctx.method === "session"` (API key alone insufficient). |
| 10 | MEDIUM | Trace persistence best-effort — `persistTrace().catch(() => {})` silently swallowed errors; `shared-trace-store-persistence.js` used `console.error` | `trace-store.js`: logs via `mapleLog("warn", "trace_persist_failed", { traceId, error })`. `shared-trace-store-persistence.js`: replaced all `console.error` with `mapleLog("warn", ...)` for structured logging. |

**Files changed:** 17 | **Insertions:** 290 | **Deletions:** 100

---

## Inter-Service Bug Fixes — 28 Issues

**Commit:** `ecf61b5`

### Phase 1 — Proto Field Gaps

Added missing fields to `cyber_proxy.proto`:
- **Request:** `body`, `timeout_ms`, `tool_name`, `app_id` — POST bodies and tool metadata were silently dropped
- **Response:** `body`, `duration_ms`, security scan fields — scan results were lost in transit

### Phase 2 — gRPC Protection

Replaced gateway's bare `grpcUnary` with production-grade `grpcUnaryProtected`:
- 5-second deadlines on all context-wall calls
- Circuit breaker with configurable failure threshold
- Metrics collection per-call
- Connection pool round-robin for load distribution

### Phase 3 — Audit Pipeline

- Wired config into `AuditStore` constructor
- Capped `writeBuffer` size to prevent OOM under sustained load
- Added missing DLQ columns: `request_id`, `user_id`, `key_fingerprint`
- Completed `StreamEvents`/`QueryEvents` field mapping between gRPC and SQL

### Phase 4 — SSRF Prevention

Fixed domain matching from `endsWith(d)` to exact-or-subdomain check — blocklist entry `"evil.com"` no longer incorrectly matched `"notevil.com"`

### Phase 5 — Firewall Evaluation

Rule evaluation now collects all matches and returns the most restrictive action instead of short-circuiting on first match

### Phase 6 — Concurrency & Security

- Constant-time API key comparison across all key checks
- Eager pool init in context-wall to eliminate lazy-init race condition
- `WatchApprovalQueue` error handling with `call.on("error")` cleanup

**Files changed:** 45 | **Insertions:** 1,505 | **Deletions:** 517

---

## Performance & Interconnectivity — 20 Issues

**Commit:** `6d1b0c1`

### Deadlines & Protection

| Service | Change |
|---------|--------|
| context-wall | 5s default deadline on `grpcUnary` |
| mcp-proxy | 5s default deadline on `grpcUnary` |
| tool-runner | 5s default deadline on `grpcUnary` |
| admin-console | Pooled connections with circuit breakers and per-RPC deadlines |
| All | Circuit breaker errors set `err.code = "UNAVAILABLE"` for proper gRPC status propagation |

### Eager Pool Initialization

| Service | Change |
|---------|--------|
| mcp-proxy | cyber-proxy and audit-writer pools created at module load (eliminates cold-start hang) |
| tool-runner | Single client → pooled connections via `loadServiceClientSecurePooled` |

### Graceful Shutdown

- `gracefulShutdown()` accepts optional cleanup callback
- All services (mcp-proxy, context-wall, cyber-proxy, tool-runner) close client pools on SIGTERM/SIGINT

### Performance Optimizations

| Area | Change |
|------|--------|
| Trace store prune | O(n^2) repeated scan → O(n log n) sort-once-then-slice |
| Audit writeBuffer | O(n) shift per event → amortized 10% batch drop |
| ListTools discovery | Sequential per-app await → `Promise.all` parallelization |
| Orchestration graph | One INSERT per row → batch INSERT via UNNEST |

### Error Mapping

- Downstream dispatch timeout: `DEADLINE_EXCEEDED` instead of custom `"TIMEOUT"` code (aligns with gRPC retry)
- cyber-proxy `ProxyHttpRequestStream`: wrap `call.write()` in try/catch for client disconnect handling

**Files changed:** 22 | **Insertions:** 622 | **Deletions:** 185

---

## Remaining Performance & Interconnectivity

**Commit:** `8f2e277`

### Timeout Alignment

| Call Path | Deadline |
|-----------|----------|
| Gateway → context-wall (tool execution/forwarding) | 35s (covers mcp-proxy 30s + overhead) |
| Gateway → context-wall (metadata/tools/list) | 10s |
| Fork-executor grpcUnary | 35s (was unbounded) |

### Serialization Overhead Reduction

| Service | Change |
|---------|--------|
| audit-writer | Extract `parsePayloadJson()` — avoids double `Buffer.from→toString→JSON.parse`; also parses payloads in `AppendEventBatch` |
| mcp-proxy | Extract `jsonBuf()` helper — deduplicates 15 instances of `Buffer.from(JSON.stringify(...))` |

### In-Memory Cache Efficiency

| Component | Change |
|-----------|--------|
| AuditStore events cache | `splice(0, excess)` in-place instead of `slice(-N)` (avoids full array copy) |
| TraceStore | Added `ownerIndex` (`Map<fingerprint, Set<traceId>>`) — `listSessionIds` is O(k) where k=owned traces instead of O(n*m) |
| TraceStore.listTraces | Eliminated redundant double-filter on ownership |

### Database

- Added partial index `idx_tenant_policies_active` on `(tenant_id, org_id) WHERE is_active=TRUE` for policy lookup optimization

**Files changed:** 12 | **Insertions:** 203 | **Deletions:** 93

---

## Frontend Cleanup

### Build Artifact Cleanup

**Commit:** `66d6ba7`

- Added `.next_stale*` pattern to `.gitignore`
- Removed 446 tracked `.next_stale_1772685531/` build artifacts from repository
- Simplified `MapleWorkspaceShell.jsx` component

**Files changed:** 448 | **Deletions:** 8,102

### Deprecated Source Removal

**Commit:** `a6c4a9e`

- Deleted 128 `frontendB-desktop-app` template-runtime source files (fully migrated)
- Updated frontendC Header component
- Updated frontendD trace-export widget
- Updated frontend unit tests and vitest config

**Files changed:** 133 | **Insertions:** 598 | **Deletions:** 13,191

### Initial Layout Simplification

**Commit:** `93ab49d`

- Simplified frontend layout to `MaypleOpsShell`
- Cleaned up dev config and `.env` settings

---

## Files Modified Summary

### Security (Rounds 1-3): 55 unique vulnerabilities fixed

| Category | Count |
|----------|-------|
| Critical | 3 |
| High | 23 |
| Medium | 16 |
| Low/Cleanup | 13 |

### Key files touched across all security rounds

| File | Changes |
|------|---------|
| `core/tenant-claim-resolver.js` | Expiring signed claims, DB binding enforcement, verified scope resolution |
| `core/step-up-auth.js` | Scoped verification, atomic consume, required tenant predicates |
| `core/audit-integrity.js` | Transactional hash chain inserts |
| `core/audit-outbox.js` | Atomic outbox flushing, tenant-filtered replay, caller-provided eventIds |
| `core/alert-webhook.js` | Tenant-scoped delete and delivery log |
| `core/escalation-chain.js` | Tenant-scoped break-glass review, self-review prevention |
| `routes/gpt-adapter-oauth-routes.js` | PKCE S256, HMAC-signed codes/tokens, redirect_uri enforcement |
| `routes/orchestration-operations-routes.js` | Verified scope, removed body override |
| `routes/orchestration-observability-routes.js` | Verified scope on all endpoints, tenant filters |
| `routes/auth-routes-google.js` | email_verified check, allowSelfSignup gate |
| `routes/auth-routes-login-register.js` | Rightmost XFF IP extraction, rate limiting |
| `routes/auth-routes-recovery.js` | Rate limiting on verify-email |
| `routes/platform-proxy-routes.js` | User existence check, session auth for limits override |
| `routes/firewall-chat-routes.js` | Verified scope, reject body-supplied tenant/user |
| `routes/redirect-routes.js` | Verified scope, auth context for userId |
| `middleware.js` | tenantVerified flag on request context |
| `audit-emitter.js` | Single eventId across outbox and chain |
| `core/trace-store.js` | Structured error logging for persistence |
| `network/shared-trace-store-persistence.js` | mapleLog instead of console.error |

### Performance: 20+ optimizations

| Area | Improvement |
|------|-------------|
| gRPC deadlines | All cross-service calls have bounded timeouts (5s–35s) |
| Connection pooling | Eager init, round-robin, circuit breakers on all services |
| Graceful shutdown | All services clean up client pools on SIGTERM |
| Trace store | O(n^2) → O(n log n) pruning; owner index for O(k) lookups |
| Audit buffer | Amortized batch drop instead of per-event shift |
| Tool discovery | Parallel Promise.all instead of sequential |
| Graph persistence | Batch INSERT via UNNEST |
| Serialization | Deduplicated Buffer.from(JSON.stringify) helpers |
| Database | Partial index for active tenant policies |

### Inter-service: 28 bug fixes

| Area | Fixes |
|------|-------|
| Proto definitions | Missing request/response fields added |
| SSRF | Exact-or-subdomain matching |
| Firewall rules | Most-restrictive-action evaluation |
| API key comparison | Constant-time across all checks |
| Pool initialization | Eager init eliminates cold-start races |
| Error handling | Proper gRPC status codes, client disconnect safety |
