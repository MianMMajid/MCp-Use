#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"

if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${ROOT_DIR}/.env"
  set +a
fi

set_default() {
  local key="$1"
  local value="$2"
  if [ -z "${!key:-}" ]; then
    export "${key}=${value}"
  fi
}

set_local_cert_default() {
  local key="$1"
  local value="$2"
  local current="${!key:-}"
  if [ -z "${current}" ] || [ "${current}" = "/dev/null" ]; then
    export "${key}=${value}"
  fi
}

CERT_DIR="${ROOT_DIR}/backend/backendA-platform-infra/certs"

set_default NODE_ENV development
set_default MAPLE_API_KEY local-demo-key
set_default MCP_URL http://127.0.0.1:3000
set_default MAPLE_GATEWAY_ORIGIN http://127.0.0.1:3000
set_default MAPLE_ALLOW_NO_AUTH 1
set_default MAPLE_DISABLE_TLS true
set_default MAPLE_DISABLE_AUDIT_EMIT 1
set_default MAPLE_SKIP_AUTH_BOOTSTRAP 1
set_default MAPLE_ADMIN_ALLOW_NO_AUTH 1
set_default MAPLE_DISABLE_HITL_BROKER 1
set_default MAPLE_AUTH_ALLOW_SELF_SIGNUP 0
set_default MAPLE_FIREWALL_LOG_DIR /tmp/maple-firewall-logs
set_default MAPLE_INTEGRATION_OAUTH_STATE_SECRET local-dev-oauth-state-secret-32chars
set_default MAPLE_INTEGRATION_OAUTH_ENCRYPTION_KEY local-dev-oauth-encryption-key-32c
set_default MAPLE_CREDENTIAL_SIGNING_KEY local-dev-credential-signing-key-64chars-abcdef0123456789abcdef0123456789

set_default DATABASE_URL postgresql://maple:maple@127.0.0.1:5432/maple
set_default MAPLE_REDIS_URL redis://127.0.0.1:6379
set_default MAPLE_EVENT_TRANSPORT_BACKEND pg

set_default MAPLE_GRPC_TLS_CERT "${CERT_DIR}/tls.crt"
set_default MAPLE_GRPC_TLS_KEY "${CERT_DIR}/tls.key"
set_default MAPLE_GRPC_TLS_CA "${CERT_DIR}/ca.crt"
set_local_cert_default MAPLE_GATEWAY_TLS_CERT "${CERT_DIR}/tls.crt"
set_local_cert_default MAPLE_GATEWAY_TLS_KEY "${CERT_DIR}/tls.key"
set_local_cert_default MAPLE_GATEWAY_TLS_CA "${CERT_DIR}/ca.crt"
set_local_cert_default MAPLE_ADMIN_TLS_CERT "${CERT_DIR}/tls.crt"
set_local_cert_default MAPLE_ADMIN_TLS_KEY "${CERT_DIR}/tls.key"
set_local_cert_default MAPLE_ADMIN_TLS_CA "${CERT_DIR}/ca.crt"
set_local_cert_default MAPLE_BUSINESS_API_TLS_CERT "${CERT_DIR}/tls.crt"
set_local_cert_default MAPLE_BUSINESS_API_TLS_KEY "${CERT_DIR}/tls.key"
set_local_cert_default MAPLE_BUSINESS_API_TLS_CA "${CERT_DIR}/ca.crt"

set_default GATEWAY_PORT 3000
set_default GATEWAY_HOST 0.0.0.0
set_default CONTEXT_WALL_PORT 19000
set_default CONTEXT_WALL_HOST 0.0.0.0
set_default MCP_PROXY_PORT 19200
set_default MCP_PROXY_HOST 0.0.0.0
set_default CYBER_PROXY_PORT 18080
set_default CYBER_PROXY_HOST 0.0.0.0
set_default AUDIT_WRITER_PORT 19400
set_default AUDIT_WRITER_HTTP_PORT 19401
set_default AUDIT_WRITER_HOST 0.0.0.0

set_default CONTEXT_WALL_ADDRESS 127.0.0.1:${CONTEXT_WALL_PORT}
set_default MCP_PROXY_ADDRESS 127.0.0.1:${MCP_PROXY_PORT}
set_default CYBER_PROXY_ADDRESS 127.0.0.1:${CYBER_PROXY_PORT}
set_default AUDIT_WRITER_ADDRESS 127.0.0.1:${AUDIT_WRITER_PORT}
set_default CORS_ORIGIN "*"

set_default MAPLE_ALLOW_BRIDGE_OVERRIDE 0
set_default MAPLE_LOCK_BRIDGE_TARGET 0
set_default MAPLE_MCP_ROUTE_LOCK 0
set_default MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS 0
set_default MAPLE_MCP_PROXY_ALLOW_HTTP 0
set_default MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS 0
set_default MAPLE_MCP_PROXY_DEFAULT_TARGET_URL http://127.0.0.1:3000
set_default MAPLE_MCP_PROXY_ALLOWED_HOSTS localhost,127.0.0.1
set_default MAPLE_MCP_FIREWALL_DEFAULT_APP default
set_default MAPLE_MCP_EXECUTION_ORDER default
set_default MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS 15000
set_default DOWNSTREAM_APPS none
set_default MAPLE_DOWNSTREAM_APPS "[]"
set_default MAPLE_TOOL_RUNNER_MODE service
set_default MAPLE_TOOL_RUNNER_IMAGE tool-runner:latest
set_default MAPLE_TOOL_RUNNER_JOB_NAMESPACE maple-tools

set_default MAPLE_ENABLE_DEMO_ROUTES 1
set_default MAPLE_ENABLE_JUDGE_UI 1
set_default MAPLE_SESSION_COOKIE_NAME maple_session
set_default MAPLE_SESSION_TTL_SECONDS 604800
set_default MAPLE_SESSION_OWNER_SCOPE auto
set_default MAPLE_SESSION_POLL 1
set_default MAPLE_SESSION_POLL_MS 5000
set_default MAPLE_TENANT_CLAIM_SIGNING_KEY local-dev-tenant-signing-key

set_default CONTEXT_WALL_HITL_TIMEOUT_MS 120000
set_default DEFAULT_MODEL gpt-4o
set_default CYBER_ALLOWED_DOMAINS example.com,localhost,127.0.0.1
set_default CYBER_BLOCKED_DOMAINS evil.com
set_default CYBER_TOOL_ALLOWED_DOMAINS_JSON "{}"
set_default CYBER_ALLOW_LOCAL_TARGETS 1
set_default CYBER_ALLOWED_LOCAL_HOSTS localhost,127.0.0.1
set_default CYBER_MAX_RESPONSE_BYTES 10485760
set_default CYBER_QUARANTINE_ENABLED 1

set_default STRIPE_SECRET_KEY sk_test_ci_placeholder
set_default STRIPE_WEBHOOK_SECRET whsec_ci_test
set_default STRIPE_PRICE_PRO price_pro_ci
set_default STRIPE_PRICE_TEAM price_team_ci
set_default STRIPE_PRICE_ENTERPRISE price_enterprise_ci
set_default STRIPE_PUBLISHABLE_KEY pk_test_ci_placeholder
set_default GOOGLE_CLIENT_ID ci-test-google-client-id
set_default MAPLE_GPT_OAUTH_CLIENT_ID maple-gpt-client
set_default MAPLE_GPT_OAUTH_CLIENT_SECRET maple-secret

set_default MAPLE_RECOVERY_DELIVERY_REQUIRED 0
set_default MAPLE_RECOVERY_EMAIL_PROVIDER none
set_default MAPLE_RECOVERY_EMAIL_FROM noreply@local.test
set_default MAPLE_RECOVERY_EMAIL_REPLY_TO support@local.test
set_default MAPLE_RECOVERY_EMAIL_SUBJECT_PREFIX "[Maple]"
set_default MAPLE_RECOVERY_RESET_BASE_URL http://127.0.0.1:3000/reset-password
set_default MAPLE_RECOVERY_VERIFY_BASE_URL http://127.0.0.1:3000/verify-email
set_default SENDGRID_API_KEY ci-test-sendgrid-key
set_default RESEND_API_KEY ci-test-resend-key
set_default MAPLE_RECOVERY_SMS_PROVIDER none
set_default MAPLE_RECOVERY_SMS_TO +10000000000
set_default MAPLE_RECOVERY_SMS_FROM +10000000001
set_default TWILIO_ACCOUNT_SID ci-test-twilio-sid
set_default TWILIO_AUTH_TOKEN ci-test-twilio-token

set_default MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW 0
set_default MAPLE_FIREWALL_CHAT_STRICT_MODE 0
set_default MAPLE_FIREWALL_CHAT_PRIMARY openai
set_default MAPLE_FIREWALL_CHAT_OPENAI_MODEL gpt-4o-mini
set_default MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL claude-sonnet-4-6
set_default MAPLE_FIREWALL_CHAT_TIMEOUT_MS 15000
set_default OPENAI_API_KEY ci-test-openai-key
set_default ANTHROPIC_API_KEY ci-test-anthropic-key

set_default MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS 0
set_default MAPLE_ESCALATION_CHECK_INTERVAL_MS 30000
set_default MAPLE_RETENTION_CHECK_INTERVAL_MS 86400000
set_default MAPLE_MODIFIER_GOVERNANCE_ENABLED 0
set_default MAPLE_LEADER_ELECTION_ENABLED 1
set_default MAPLE_OTLP_ENDPOINT http://127.0.0.1:4318
set_default MAPLE_OTLP_SERVICE_NAME gateway-api
set_default MAPLE_OTLP_BATCH_SIZE 100
set_default MAPLE_OTLP_FLUSH_INTERVAL_MS 5000
set_default MAPLE_OTLP_TIMEOUT_MS 5000

local_otlp_endpoint="${MAPLE_OTLP_ENDPOINT:-}"
local_otlp_enabled="${MAPLE_DEV_FAST_ENABLE_OTLP:-0}"
case "${local_otlp_endpoint}" in
  http://localhost:4317|http://127.0.0.1:4317|http://localhost:4318|http://127.0.0.1:4318)
    if [ "${local_otlp_enabled}" = "1" ]; then
      export MAPLE_OTLP_ENDPOINT="http://127.0.0.1:4318"
    else
      export MAPLE_OTLP_ENDPOINT="disabled"
    fi
    ;;
esac

if [ "${DEV_FAST_OPENCLAW:-0}" = "1" ]; then
  if ! command -v openclaw >/dev/null 2>&1; then
    echo "OpenClaw CLI is required for DEV_FAST_OPENCLAW=1." >&2
    echo "Install it with: bash backend/backendA-platform-infra/scripts/install-openclaw.sh" >&2
    exit 1
  fi

  set_default MAPLE_OPENCLAW_AGENT_ENABLED 1
  set_default MAPLE_OPENCLAW_AGENT_MODE gateway
  set_default MAPLE_OPENCLAW_AGENT_REQUIRED 0
  set_default MAPLE_OPENCLAW_AGENT_DEV_PROFILE 1
  set_default MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY 0
  set_default MAPLE_OPENCLAW_AGENT_GATEWAY_PORT 19001
  set_default MAPLE_OPENCLAW_AGENT_GATEWAY_BIND loopback
  set_default MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID agent-dev-main
  set_default MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING medium
  set_default MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS 120
  set_default MAPLE_OPENCLAW_MODIFIER_ENABLED 1
  set_default MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE 1
  set_default MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS 900
  set_default MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS 90
  set_default MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB 8
  set_default MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE default
  set_default MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS agent,agents,message,sessions,status,health,gateway,memory,models,skills,nodes,logs
  set_default MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS setup,onboard,configure,config,reset,uninstall,update,plugins,webhooks,hooks,pairing,devices,node,sandbox,daemon,voicecall,acp,system,directory,dns,browser,cron
  set_default MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES default,main,primary,root,system
  set_default MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE 0
  set_default MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC 0
  set_default MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY 0
  set_default MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER 1
  set_default MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX 1
  set_default MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS 5000
  set_default MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE 50
  set_default MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES 5
  set_default OPENCLAW_BRIDGE_PORT 8787
  set_default OPENCLAW_BRIDGE_HOST 127.0.0.1
  set_default OPENCLAW_BRIDGE_TOKEN dev-fast-bridge-token
  set_default OPENCLAW_BRIDGE_MODE gateway
  set_default OPENCLAW_BRIDGE_REQUIRE_AUTH 0
  set_default OPENCLAW_GATEWAY_WS_URL ws://127.0.0.1:${MAPLE_OPENCLAW_AGENT_GATEWAY_PORT}
  set_default OPENCLAW_GATEWAY_SESSION_KEY "${MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID}"
  set_default OPENCLAW_BRIDGE_URL http://127.0.0.1:${OPENCLAW_BRIDGE_PORT}
  set_default OPENCLAW_BRIDGE_TOKEN "${OPENCLAW_BRIDGE_TOKEN}"
else
  set_default MAPLE_OPENCLAW_AGENT_ENABLED 0
  set_default MAPLE_OPENCLAW_AGENT_MODE gateway
  set_default MAPLE_OPENCLAW_AGENT_REQUIRED 0
  set_default MAPLE_OPENCLAW_AGENT_DEV_PROFILE 0
  set_default MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY 0
  set_default MAPLE_OPENCLAW_AGENT_GATEWAY_PORT 19001
  set_default MAPLE_OPENCLAW_AGENT_GATEWAY_BIND loopback
  set_default MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID agent-dev-main
  set_default MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING medium
  set_default MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS 120
  set_default MAPLE_OPENCLAW_MODIFIER_ENABLED 0
  set_default MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE 0
  set_default MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS 900
  set_default MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS 90
  set_default MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB 8
  set_default MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE default
  set_default MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS agent,agents,message,sessions,status,health,gateway,memory,models,skills,nodes,logs
  set_default MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS setup,onboard,configure,config,reset,uninstall,update,plugins,webhooks,hooks,pairing,devices,node,sandbox,daemon,voicecall,acp,system,directory,dns,browser,cron
  set_default MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES default,main,primary,root,system
  set_default MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE 0
  set_default MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC 0
  set_default MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY 0
  set_default MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER 0
  set_default MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX 0
  set_default MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS 5000
  set_default MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE 50
  set_default MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES 5
  set_default OPENCLAW_BRIDGE_URL http://127.0.0.1:8787
  set_default OPENCLAW_BRIDGE_TOKEN dev-fast-bridge-token
fi
