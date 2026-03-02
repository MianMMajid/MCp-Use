#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Railway Entrypoint — Multi-Service Dispatcher
# Generates self-signed TLS certs, sets sensible defaults for ALL required
# env vars, and starts the service specified by MAPLE_SERVICE.
#
# Supported MAPLE_SERVICE values:
#   gateway-api (default), admin-console-api, context-wall, model-router,
#   mcp-proxy, tool-runner, cyber-proxy, secrets-broker, audit-writer,
#   frontendA, frontendB
# ──────────────────────────────────────────────────────────────────────────────

MAPLE_SERVICE="${MAPLE_SERVICE:-gateway-api}"
echo "[railway-entrypoint] Service: ${MAPLE_SERVICE}"

# ── Health sidecar for gRPC services (they lack HTTP /health endpoints) ──────
# Starts a tiny HTTP server on HEALTH_PORT that returns 200 for /health.
# The main gRPC process starts via exec (replacing shell), sidecar runs as orphan.
start_health_sidecar() {
  local hp="${1}"
  node -e "
    require('http').createServer((q,r) => {
      r.writeHead(200, {'Content-Type':'application/json'});
      r.end(JSON.stringify({status:'ok',service:'${MAPLE_SERVICE}'}));
    }).listen(${hp}, '0.0.0.0', () => console.log('[health-sidecar] listening on ' + ${hp}));
  " &
}

TLS_DIR="/tmp/tls"
mkdir -p "${TLS_DIR}"

# ── Generate self-signed TLS certs (Railway terminates real TLS at edge) ─────
if [ ! -f "${TLS_DIR}/tls.crt" ]; then
  echo "[railway-entrypoint] Generating self-signed TLS certificates..."
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "${TLS_DIR}/ca.key" -out "${TLS_DIR}/ca.crt" \
    -days 3650 -subj "/CN=Maple Railway CA" 2>/dev/null

  openssl req -newkey rsa:2048 -nodes \
    -keyout "${TLS_DIR}/tls.key" -out "${TLS_DIR}/tls.csr" \
    -subj "/CN=localhost" 2>/dev/null

  cat > "${TLS_DIR}/ext.cnf" <<'EXTEOF'
subjectAltName = @alt_names
extendedKeyUsage = serverAuth, clientAuth
keyUsage = digitalSignature, keyEncipherment
[alt_names]
DNS.1 = localhost
DNS.2 = gateway-api
DNS.3 = 0.0.0.0
IP.1 = 127.0.0.1
EXTEOF

  openssl x509 -req -in "${TLS_DIR}/tls.csr" \
    -CA "${TLS_DIR}/ca.crt" -CAkey "${TLS_DIR}/ca.key" -CAcreateserial \
    -out "${TLS_DIR}/tls.crt" -days 825 -extfile "${TLS_DIR}/ext.cnf" 2>/dev/null

  rm -f "${TLS_DIR}/tls.csr" "${TLS_DIR}/ext.cnf" "${TLS_DIR}/ca.srl"
  echo "[railway-entrypoint] TLS certs ready."
fi

# ══════════════════════════════════════════════════════════════════════════════
# COMMON ENV VARS (shared across all backend services)
# ══════════════════════════════════════════════════════════════════════════════

# ── Core ─────────────────────────────────────────────────────────────────────
export NODE_ENV="${MAPLE_NODE_ENV:-staging}"
export MAPLE_DISABLE_TLS="${MAPLE_DISABLE_TLS:-true}"

# ── Logging (maple-common/logging.js requires these) ─────────────────────────
export MAPLE_LOG_LEVEL="${MAPLE_LOG_LEVEL:-info}"
export MAPLE_LOG_INCLUDE_BODIES="${MAPLE_LOG_INCLUDE_BODIES:-false}"
export MAPLE_LOG_REQUESTS="${MAPLE_LOG_REQUESTS:-true}"
export MAPLE_LOG_BODY_MAX_CHARS="${MAPLE_LOG_BODY_MAX_CHARS:-2000}"

# ── TLS paths (used by gateway and admin-console-api for HTTPS) ──────────────
export MAPLE_GATEWAY_TLS_CERT="${MAPLE_GATEWAY_TLS_CERT:-${TLS_DIR}/tls.crt}"
export MAPLE_GATEWAY_TLS_KEY="${MAPLE_GATEWAY_TLS_KEY:-${TLS_DIR}/tls.key}"
export MAPLE_GATEWAY_TLS_CA="${MAPLE_GATEWAY_TLS_CA:-${TLS_DIR}/ca.crt}"
export MAPLE_ADMIN_TLS_CERT="${MAPLE_ADMIN_TLS_CERT:-${TLS_DIR}/tls.crt}"
export MAPLE_ADMIN_TLS_KEY="${MAPLE_ADMIN_TLS_KEY:-${TLS_DIR}/tls.key}"
export MAPLE_ADMIN_TLS_CA="${MAPLE_ADMIN_TLS_CA:-${TLS_DIR}/ca.crt}"

# ── Database (Railway injects DATABASE_URL from Postgres plugin) ─────────────
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/railway}"

# ── Firewall Policy Engine (maple-security requires these) ───────────────────
export MAPLE_FIREWALL_ENABLED="${MAPLE_FIREWALL_ENABLED:-true}"
export MAPLE_FIREWALL_DEFAULT_ACTION="${MAPLE_FIREWALL_DEFAULT_ACTION:-allow}"
export MAPLE_FIREWALL_LOG_DIR="${MAPLE_FIREWALL_LOG_DIR:-/tmp/maple-firewall-logs}"
mkdir -p "${MAPLE_FIREWALL_LOG_DIR}" 2>/dev/null || true

# ── Firewall Chat AI ────────────────────────────────────────────────────────
export OPENAI_API_KEY="${OPENAI_API_KEY:-not-configured}"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-not-configured}"
export MAPLE_FIREWALL_CHAT_PRIMARY="${MAPLE_FIREWALL_CHAT_PRIMARY:-openai}"
export MAPLE_FIREWALL_CHAT_OPENAI_MODEL="${MAPLE_FIREWALL_CHAT_OPENAI_MODEL:-gpt-4o-mini}"
export MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL="${MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL:-claude-sonnet-4-6}"
export MAPLE_FIREWALL_CHAT_TIMEOUT_MS="${MAPLE_FIREWALL_CHAT_TIMEOUT_MS:-15000}"
export MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW="${MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW:-false}"
export MAPLE_FIREWALL_CHAT_STRICT_MODE="${MAPLE_FIREWALL_CHAT_STRICT_MODE:-false}"

# ── gRPC service addresses (overridden per-service in Railway) ───────────────
export CONTEXT_WALL_ADDRESS="${CONTEXT_WALL_ADDRESS:-localhost:9000}"
export MODEL_ROUTER_ADDRESS="${MODEL_ROUTER_ADDRESS:-localhost:9100}"
export MCP_PROXY_ADDRESS="${MCP_PROXY_ADDRESS:-localhost:9200}"
export TOOL_RUNNER_ADDRESS="${TOOL_RUNNER_ADDRESS:-localhost:9250}"
export CYBER_PROXY_ADDRESS="${CYBER_PROXY_ADDRESS:-localhost:8090}"
# Note: cyber-proxy defaults to port 8090 to avoid conflict with Railway's PORT (8080)
export SECRETS_BROKER_ADDRESS="${SECRETS_BROKER_ADDRESS:-localhost:9300}"
export AUDIT_WRITER_ADDRESS="${AUDIT_WRITER_ADDRESS:-localhost:9400}"

# ══════════════════════════════════════════════════════════════════════════════
# SERVICE DISPATCH
# ══════════════════════════════════════════════════════════════════════════════

case "${MAPLE_SERVICE}" in

  # ────────────────────────────────────────────────────────────────────────────
  gateway-api)
  # ────────────────────────────────────────────────────────────────────────────
    export GATEWAY_PORT="${PORT:-${GATEWAY_PORT:-3000}}"
    export GATEWAY_HOST="${GATEWAY_HOST:-0.0.0.0}"
    export CORS_ORIGIN="${CORS_ORIGIN:-*}"

    # Auth / Session
    export MAPLE_ALLOW_NO_AUTH="${MAPLE_ALLOW_NO_AUTH:-true}"
    export MAPLE_SESSION_COOKIE_NAME="${MAPLE_SESSION_COOKIE_NAME:-maple_sid}"
    export MAPLE_SESSION_TTL_SECONDS="${MAPLE_SESSION_TTL_SECONDS:-604800}"
    export MAPLE_AUTH_ALLOW_SELF_SIGNUP="${MAPLE_AUTH_ALLOW_SELF_SIGNUP:-true}"
    export MAPLE_SESSION_OWNER_SCOPE="${MAPLE_SESSION_OWNER_SCOPE:-auto}"
    export MAPLE_SESSION_POLL="${MAPLE_SESSION_POLL:-0}"
    export MAPLE_SESSION_POLL_MS="${MAPLE_SESSION_POLL_MS:-5000}"
    export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-not-configured}"
    export MAPLE_GPT_OAUTH_CLIENT_ID="${MAPLE_GPT_OAUTH_CLIENT_ID:-not-configured}"
    export MAPLE_GPT_OAUTH_CLIENT_SECRET="${MAPLE_GPT_OAUTH_CLIENT_SECRET:-not-configured}"

    # Bridge / Lockdown
    export MAPLE_ALLOW_BRIDGE_OVERRIDE="${MAPLE_ALLOW_BRIDGE_OVERRIDE:-true}"
    export MAPLE_LOCK_BRIDGE_TARGET="${MAPLE_LOCK_BRIDGE_TARGET:-false}"
    export OPENCLAW_BRIDGE_URL="${OPENCLAW_BRIDGE_URL:-http://127.0.0.1:8787}"
    export OPENCLAW_BRIDGE_TOKEN="${OPENCLAW_BRIDGE_TOKEN:-railway-dev-token}"

    # OpenClaw Agent
    export MAPLE_OPENCLAW_AGENT_ENABLED="${MAPLE_OPENCLAW_AGENT_ENABLED:-true}"
    export MAPLE_OPENCLAW_AGENT_MODE="${MAPLE_OPENCLAW_AGENT_MODE:-local}"
    export MAPLE_OPENCLAW_AGENT_REQUIRED="${MAPLE_OPENCLAW_AGENT_REQUIRED:-false}"
    export MAPLE_OPENCLAW_AGENT_DEV_PROFILE="${MAPLE_OPENCLAW_AGENT_DEV_PROFILE:-true}"
    export MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY="${MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY:-true}"
    export MAPLE_OPENCLAW_AGENT_GATEWAY_PORT="${MAPLE_OPENCLAW_AGENT_GATEWAY_PORT:-19001}"
    export MAPLE_OPENCLAW_AGENT_GATEWAY_BIND="${MAPLE_OPENCLAW_AGENT_GATEWAY_BIND:-loopback}"
    export MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID="${MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID:-railway-default}"
    export MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING="${MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING:-brief}"
    export MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS="${MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS:-120}"

    # OpenClaw Modifier
    export MAPLE_OPENCLAW_MODIFIER_ENABLED="${MAPLE_OPENCLAW_MODIFIER_ENABLED:-true}"
    export MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE="${MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE:-true}"
    export MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS="${MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS:-3600}"
    export MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS="${MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS:-120}"
    export MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB="${MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB:-8}"
    export MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE="${MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE:-default}"
    export MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS="${MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS:-all}"
    export MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS="${MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS:-none}"
    export MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES="${MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES:-none}"
    export MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE="${MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE:-false}"
    export MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC="${MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC:-false}"
    export MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY="${MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY:-false}"
    export MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER="${MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER:-true}"
    export MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX="${MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX:-false}"
    export MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS="${MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS:-5000}"
    export MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE="${MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE:-50}"
    export MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES="${MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES:-5}"

    # Enterprise / Governance
    export MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS="${MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS:-false}"
    export MAPLE_ESCALATION_CHECK_INTERVAL_MS="${MAPLE_ESCALATION_CHECK_INTERVAL_MS:-30000}"
    export MAPLE_RETENTION_CHECK_INTERVAL_MS="${MAPLE_RETENTION_CHECK_INTERVAL_MS:-60000}"
    export MAPLE_MODIFIER_GOVERNANCE_ENABLED="${MAPLE_MODIFIER_GOVERNANCE_ENABLED:-false}"
    export MAPLE_LEADER_ELECTION_ENABLED="${MAPLE_LEADER_ELECTION_ENABLED:-false}"

    # Observability (OTLP)
    export MAPLE_OTLP_ENDPOINT="${MAPLE_OTLP_ENDPOINT:-http://localhost:4318}"
    export MAPLE_OTLP_SERVICE_NAME="${MAPLE_OTLP_SERVICE_NAME:-maple-gateway}"
    export MAPLE_OTLP_BATCH_SIZE="${MAPLE_OTLP_BATCH_SIZE:-100}"
    export MAPLE_OTLP_FLUSH_INTERVAL_MS="${MAPLE_OTLP_FLUSH_INTERVAL_MS:-5000}"
    export MAPLE_OTLP_TIMEOUT_MS="${MAPLE_OTLP_TIMEOUT_MS:-10000}"

    # Event Transport
    export MAPLE_EVENT_TRANSPORT_BACKEND="${MAPLE_EVENT_TRANSPORT_BACKEND:-pg}"
    export MAPLE_REDIS_URL="${MAPLE_REDIS_URL:-redis://localhost:6379}"

    # MCP Proxy / Routing
    export MAPLE_MCP_FIREWALL_DEFAULT_APP="${MAPLE_MCP_FIREWALL_DEFAULT_APP:-default}"
    export MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS="${MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS:-true}"
    export MAPLE_MCP_PROXY_ALLOW_HTTP="${MAPLE_MCP_PROXY_ALLOW_HTTP:-true}"
    export MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS="${MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS:-true}"
    export MAPLE_MCP_PROXY_DEFAULT_TARGET_URL="${MAPLE_MCP_PROXY_DEFAULT_TARGET_URL:-http://localhost:9200}"
    export MAPLE_MCP_PROXY_ALLOWED_HOSTS="${MAPLE_MCP_PROXY_ALLOWED_HOSTS:-localhost}"
    export MAPLE_MCP_EXECUTION_ORDER="${MAPLE_MCP_EXECUTION_ORDER:-default}"
    export MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS="${MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS:-15000}"
    export MAPLE_MCP_ROUTE_LOCK="${MAPLE_MCP_ROUTE_LOCK:-false}"

    # Feature Flags
    export MAPLE_ENABLE_DEMO_ROUTES="${MAPLE_ENABLE_DEMO_ROUTES:-true}"
    export MAPLE_ENABLE_JUDGE_UI="${MAPLE_ENABLE_JUDGE_UI:-true}"

    # MCP Server base URL (state.js requires this)
    export MCP_URL="${MCP_URL:-http://0.0.0.0:${GATEWAY_PORT}}"

    # Tenant claim signing key (tenant-claim-resolver.js requires this)
    export MAPLE_TENANT_CLAIM_SIGNING_KEY="${MAPLE_TENANT_CLAIM_SIGNING_KEY:-railway-dev-signing-key}"

    # Billing (Stripe)
    export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_not_configured}"
    export STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_not_configured}"
    export STRIPE_PRICE_PRO="${STRIPE_PRICE_PRO:-price_not_configured}"
    export STRIPE_PRICE_TEAM="${STRIPE_PRICE_TEAM:-price_not_configured}"
    export STRIPE_PRICE_ENTERPRISE="${STRIPE_PRICE_ENTERPRISE:-price_not_configured}"
    export STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY:-pk_test_not_configured}"

    # Business API
    export MAPLE_BUSINESS_API_BASE_URL="${MAPLE_BUSINESS_API_BASE_URL:-https://localhost:9550}"
    export MAPLE_BUSINESS_API_REQUIRED="${MAPLE_BUSINESS_API_REQUIRED:-false}"
    export MAPLE_BUSINESS_API_CA="${MAPLE_BUSINESS_API_CA:-${TLS_DIR}/ca.crt}"
    export MAPLE_BUSINESS_API_CERT="${MAPLE_BUSINESS_API_CERT:-${TLS_DIR}/tls.crt}"
    export MAPLE_BUSINESS_API_KEY="${MAPLE_BUSINESS_API_KEY:-${TLS_DIR}/tls.key}"
    export MAPLE_BUSINESS_API_TIMEOUT_MS="${MAPLE_BUSINESS_API_TIMEOUT_MS:-5000}"

    echo "[railway-entrypoint] Starting gateway-api on port ${GATEWAY_PORT}..."
    echo "[railway-entrypoint] DB: ${DATABASE_URL%%@*}@..."
    exec node backend/backendB-core-services/gateway-api/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  admin-console-api)
  # ────────────────────────────────────────────────────────────────────────────
    export ADMIN_CONSOLE_PORT="${PORT:-${ADMIN_CONSOLE_PORT:-9443}}"
    export ADMIN_CONSOLE_HOST="${ADMIN_CONSOLE_HOST:-0.0.0.0}"
    export MAPLE_ADMIN_ALLOW_NO_AUTH="${MAPLE_ADMIN_ALLOW_NO_AUTH:-true}"
    export GATEWAY_API_URL="${GATEWAY_API_URL:-}"

    echo "[railway-entrypoint] Starting admin-console-api on port ${ADMIN_CONSOLE_PORT}..."
    exec node backend/backendB-core-services/admin-console-api/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  context-wall)
  # ────────────────────────────────────────────────────────────────────────────
    export CONTEXT_WALL_PORT="${CONTEXT_WALL_PORT:-9000}"
    export CONTEXT_WALL_HOST="${CONTEXT_WALL_HOST:-0.0.0.0}"
    export CONTEXT_WALL_HITL_TIMEOUT_MS="${CONTEXT_WALL_HITL_TIMEOUT_MS:-30000}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting context-wall (gRPC=${CONTEXT_WALL_PORT}, health=${PORT:-3000})..."
    exec node backend/backendB-core-services/context-wall/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  model-router)
  # ────────────────────────────────────────────────────────────────────────────
    export MODEL_ROUTER_PORT="${MODEL_ROUTER_PORT:-9100}"
    export MODEL_ROUTER_HOST="${MODEL_ROUTER_HOST:-0.0.0.0}"
    export DEFAULT_MODEL="${DEFAULT_MODEL:-gpt-4o-mini}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting model-router (gRPC=${MODEL_ROUTER_PORT}, health=${PORT:-3000})..."
    exec node backend/backendB-core-services/model-router/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  mcp-proxy)
  # ────────────────────────────────────────────────────────────────────────────
    export MCP_PROXY_PORT="${MCP_PROXY_PORT:-9200}"
    export MCP_PROXY_HOST="${MCP_PROXY_HOST:-0.0.0.0}"
    export DOWNSTREAM_APPS="${DOWNSTREAM_APPS:-default}"
    export MAPLE_DOWNSTREAM_APPS="${MAPLE_DOWNSTREAM_APPS:-default}"
    export MAPLE_TOOL_RUNNER_MODE="${MAPLE_TOOL_RUNNER_MODE:-in-process}"
    export MAPLE_TOOL_RUNNER_IMAGE="${MAPLE_TOOL_RUNNER_IMAGE:-none}"
    export MAPLE_TOOL_RUNNER_JOB_NAMESPACE="${MAPLE_TOOL_RUNNER_JOB_NAMESPACE:-default}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting mcp-proxy (gRPC=${MCP_PROXY_PORT}, health=${PORT:-3000})..."
    exec node backend/backendB-core-services/mcp-proxy/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  tool-runner)
  # ────────────────────────────────────────────────────────────────────────────
    export TOOL_RUNNER_PORT="${TOOL_RUNNER_PORT:-9250}"
    export TOOL_RUNNER_HOST="${TOOL_RUNNER_HOST:-0.0.0.0}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting tool-runner (gRPC=${TOOL_RUNNER_PORT}, health=${PORT:-3000})..."
    exec node backend/backendB-core-services/tool-runner/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  cyber-proxy)
  # ────────────────────────────────────────────────────────────────────────────
    export CYBER_PROXY_PORT="${CYBER_PROXY_PORT:-8090}"
    export CYBER_PROXY_HOST="${CYBER_PROXY_HOST:-0.0.0.0}"
    export CYBER_ALLOWED_DOMAINS="${CYBER_ALLOWED_DOMAINS:-*}"
    export CYBER_BLOCKED_DOMAINS="${CYBER_BLOCKED_DOMAINS:-none}"
    export CYBER_TOOL_ALLOWED_DOMAINS_JSON="${CYBER_TOOL_ALLOWED_DOMAINS_JSON:-{}}"
    export CYBER_MAX_RESPONSE_BYTES="${CYBER_MAX_RESPONSE_BYTES:-10485760}"
    export CYBER_QUARANTINE_ENABLED="${CYBER_QUARANTINE_ENABLED:-false}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting cyber-proxy (gRPC=${CYBER_PROXY_PORT}, health=${PORT:-3000})..."
    exec node backend/backendB-core-services/cyber-proxy/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  secrets-broker)
  # ────────────────────────────────────────────────────────────────────────────
    export SECRETS_BROKER_PORT="${SECRETS_BROKER_PORT:-9300}"
    export SECRETS_BROKER_HOST="${SECRETS_BROKER_HOST:-0.0.0.0}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting secrets-broker (gRPC=${SECRETS_BROKER_PORT}, health=${PORT:-3000})..."
    exec node backend/backendB-core-services/secrets-broker/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  audit-writer)
  # ────────────────────────────────────────────────────────────────────────────
    export AUDIT_WRITER_PORT="${AUDIT_WRITER_PORT:-9400}"
    export AUDIT_WRITER_HTTP_PORT="${AUDIT_WRITER_HTTP_PORT:-9401}"
    export AUDIT_WRITER_HOST="${AUDIT_WRITER_HOST:-0.0.0.0}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting audit-writer (gRPC=${AUDIT_WRITER_PORT}, health=${PORT:-3000})..."
    echo "[railway-entrypoint] DB: ${DATABASE_URL%%@*}@..."
    exec node backend/backendB-core-services/audit-writer/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  frontendA)
  # ────────────────────────────────────────────────────────────────────────────
    FRONTEND_PORT="${PORT:-8080}"
    echo "[railway-entrypoint] Starting frontendA (IT Console) on port ${FRONTEND_PORT}..."
    cd /app/frontend/frontendA-it-console/template-runtime
    exec npx next start -p "${FRONTEND_PORT}" -H 0.0.0.0
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  frontendB)
  # ────────────────────────────────────────────────────────────────────────────
    FRONTEND_PORT="${PORT:-8080}"
    echo "[railway-entrypoint] Starting frontendB (Desktop App) on port ${FRONTEND_PORT}..."
    cd /app/frontend/frontendB-desktop-app/template-runtime
    exec npx next start -p "${FRONTEND_PORT}" -H 0.0.0.0
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  *)
    echo "[railway-entrypoint] ERROR: Unknown MAPLE_SERVICE='${MAPLE_SERVICE}'"
    echo "Valid values: gateway-api, admin-console-api, context-wall, model-router,"
    echo "  mcp-proxy, tool-runner, cyber-proxy, secrets-broker, audit-writer,"
    echo "  frontendA, frontendB"
    exit 1
    ;;
esac
