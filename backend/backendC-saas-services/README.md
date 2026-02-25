# Backend C: SaaS Services

Owner: Backend engineer.

Purpose:
- Business/SaaS control plane services that are separate from the MCP firewall core mesh.
- User account lifecycle, billing, entitlement, and business-facing APIs.

Folders:
- `business-api/`: SaaS HTTP API for user profile, account security, and subscription status.

Migration note:
- Gateway routes migrate incrementally to this backend using proxy-first + fallback mode.
- Existing client-facing endpoint shapes are preserved while ownership shifts from backendB to backendC.
