# business-api

SaaS-owned API surface for account and subscription workflows.

Initial migration scope:
- `GET /api/business/user/profile`
- `POST /api/business/user/change-password`
- `GET /api/business/billing/subscription`
- `POST /api/business/billing/create-checkout-session`
- `POST /api/business/billing/portal-session`
- `POST /api/business/billing/webhook`
- `GET /api/business/auth/me`
- `POST /api/business/auth/login`
- `POST /api/business/auth/register`
- `POST /api/business/auth/logout`
- `GET /api/business/auth/google/client-id`
- `POST /api/business/auth/google`

This service is consumed by gateway during migration while preserving the public gateway endpoints.
