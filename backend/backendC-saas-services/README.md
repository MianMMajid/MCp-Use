# Backend C: SaaS Services

Owner: Backend engineer.

Purpose:
- Business/SaaS control plane services that are separate from the MCP firewall core mesh.
- User account lifecycle, billing, entitlement, and business-facing APIs.

Folders:
- `business-api/`: SaaS HTTP API for user profile, account security, and subscription status.

Migration note:
- Gateway routes migrate incrementally to this backend using proxy-first ownership cutover.
- In production cutover mode (`MAPLE_BUSINESS_API_REQUIRED=true`), gateway fails closed when backendC is unavailable.
- Existing client-facing endpoint shapes are preserved while ownership shifts from backendB to backendC.

Runtime note:
- `business-api` startup dependency enforcement is fail-closed in production by default.
- Override only in non-production with `MAPLE_ENFORCE_STARTUP_DEPENDENCIES=0` for local debugging.
- Google and billing routes are provider-backed only; fallback stubs are disabled.
- PostgreSQL is mandatory for runtime (`DATABASE_URL` or `MAPLE_DATABASE_URL`).
