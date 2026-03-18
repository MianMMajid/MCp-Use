# M2 Migration Guide: Single-Tenant to Multi-Tenant

This document covers the migration from the single-tenant gateway model (M1) to the multi-tenant organization-based model (M2).

## Overview

M2 introduces organization-scoped multi-tenancy to the gateway API. All platform resources (agents, sessions, API keys, billing) are scoped to an organization, with RBAC controlling access within each org.

## Database Tables

The following tables must exist before the M2 gateway can start. They are created automatically by `PlatformStore.initialize()` if using PostgreSQL, but must be verified in production:

### Core Tables

| Table | Purpose |
|---|---|
| `business_organizations` | Organization records (orgId, name, slug, tenantId) |
| `business_org_memberships` | User-to-org membership bindings with roles |
| `business_org_invites` | Pending org invitations |
| `business_user_api_keys` | Per-user API keys (key_hash, user_id, name, expires_at) |
| `business_service_account_keys` | Service account keys scoped to an org |
| `business_service_accounts` | Service account records |
| `usage_counters` | Per-org usage tracking (orgId, metric, count, period) |
| `business_subscriptions` | Billing subscription state per user/org |
| `policy_versions` | Policy version history for audit |

### Index Requirements

- `idx_business_user_api_keys_user` on `business_user_api_keys(user_id, created_at DESC)`
- `idx_business_org_memberships_user` on `business_org_memberships(user_id)`
- `idx_business_org_memberships_org` on `business_org_memberships(org_id)`
- `idx_usage_counters_org_metric` on `usage_counters(org_id, metric, period)`

## Context Header Propagation

M2 introduces tenant-scoped request context. The following headers must be propagated through all reverse proxies, load balancers, and service mesh sidecars:

| Header | Purpose | Required |
|---|---|---|
| `x-tenant-id` | Tenant identifier for cross-tenant validation | Yes (when multi-org) |
| `x-maple-tenant-id` | Alias for `x-tenant-id` (legacy compat) | No |
| `x-org-id` | Organization identifier for org-scoped requests | Recommended |
| `x-api-key` | API key for authentication | Yes |
| `authorization` | Bearer token (alternative to x-api-key) | Alternative |
| `cookie` | Session cookie for browser-based auth | Alternative |

### Cross-Tenant Validation

The gateway now validates that the authenticated tenant context matches the target organization's `tenantId`. If the `x-tenant-id` header is present and does not match the organization record, the request is rejected with HTTP 403.

Ensure that upstream proxies do **not** strip `x-tenant-id` or `x-maple-tenant-id` headers.

## API Key Masking Behavior Change

### Before (M1)

API keys were returned in full on creation and listed with full values.

### After (M2)

- **Creation**: The full key value is returned exactly once at creation time in the `key` field.
- **Listing**: Keys are returned with a `key_preview` field showing only the first 8 characters followed by `...`. The full key value is never returned in list responses.
- **Hash storage**: Keys are stored as SHA-256 hashes (`key_hash`). The raw key cannot be recovered from the database.

Clients that cache or display API keys must update to handle the preview-only format in list responses.

## Migration Steps

1. **Run database migrations**: Ensure all tables listed above exist. The `PlatformStore.initialize()` method creates them via `CREATE TABLE IF NOT EXISTS`, but verify in production.

2. **Configure tenant headers**: Update reverse proxy / ingress configuration to pass through `x-tenant-id` and `x-maple-tenant-id` headers.

3. **Update API key clients**: Clients that depend on listing full API key values must store the key at creation time, as listing now returns masked previews only.

4. **Verify org creation flow**: The `POST /api/org` endpoint now validates input via `validateOrgCreate()`. Ensure client payloads include a non-empty `name` field (max 100 characters).

5. **Update RBAC assumptions**: Organization membership roles (`owner`, `admin`, `member`, `viewer`, `billing`) are enforced on all org-scoped endpoints. Verify that service accounts and automation have appropriate roles assigned.

6. **Test entitlement checks**: The `POST /api/entitlements/check` endpoint requires `orgId` and `feature` fields. Clients must include `orgId` for all entitlement lookups.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `MAPLE_ALLOW_NO_AUTH` | `0` | Bypass auth (dev only, blocked in production) |
| `MAPLE_TENANT_CLAIM_SIGNING_KEY` | (required for multi-tenant) | HMAC key for tenant claim signing |
| `STRIPE_SECRET_KEY` | (required for billing) | Stripe API key |

## Rollback

If M2 must be rolled back to M1:

1. The additional database tables can remain -- they will be ignored by M1 code.
2. Remove `x-tenant-id` header propagation requirements (optional, M1 ignores them).
3. API key masking is backward-compatible -- M1 did not depend on full key values in list responses.
