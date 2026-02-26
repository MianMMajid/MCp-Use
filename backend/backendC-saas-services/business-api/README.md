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

## Recovery Delivery

Forgot/reset/verify flows are wired to real notification providers via
`onAuthRecoveryTokenIssued` in `service/src/main.js`.

Supported providers:
- Email: `sendgrid`, `resend`
- SMS: `twilio`

Key envs:
- `MAPLE_RECOVERY_DELIVERY_REQUIRED`
- `MAPLE_RECOVERY_EMAIL_PROVIDER`, `MAPLE_RECOVERY_EMAIL_FROM`
- `SENDGRID_API_KEY` or `RESEND_API_KEY`
- `MAPLE_RECOVERY_SMS_PROVIDER`, `MAPLE_RECOVERY_SMS_FROM`, `MAPLE_RECOVERY_SMS_TO`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- Optional links: `MAPLE_RECOVERY_RESET_BASE_URL`, `MAPLE_RECOVERY_VERIFY_BASE_URL`

## Live Provider CI

Dedicated workflow: `.github/workflows/live-provider-e2e.yml`

It runs real dependency checks for:
- Google token verification
- Stripe account/price access
- OpenClaw bridge health/sessions
