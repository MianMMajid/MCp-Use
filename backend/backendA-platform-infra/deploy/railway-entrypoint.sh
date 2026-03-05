#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Railway Entrypoint — Multi-Service Dispatcher
# Generates self-signed TLS certs, sets sensible defaults for ALL required
# env vars, and starts the service specified by MAPLE_SERVICE.
#
# Supported MAPLE_SERVICE values:
#   gateway-api (default), context-wall, mcp-proxy,
#   cyber-proxy, audit-writer,
#   frontendA, frontendB, frontendC
# Retired (stub only): tool-runner, admin-console-api, business-api,
#   model-router, secrets-broker
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

# ── Retired service compatibility shim ────────────────────────────────────────
# Some Railway services may still reference retired MAPLE_SERVICE values
# (model-router, secrets-broker). Keep those deployments healthy while the
# services are removed from Railway topology.
run_retired_service_stub() {
  local service_name="${1}"
  local replacement_hint="${2}"
  local hp="${PORT:-3000}"
  start_health_sidecar "${hp}"
  echo "[railway-entrypoint] Service '${service_name}' is retired."
  echo "[railway-entrypoint] Replacement: ${replacement_hint}"
  echo "[railway-entrypoint] Running compatibility health stub on ${hp}."
  exec node -e "
    setInterval(() => {
      console.log('[railway-entrypoint] retired service stub alive: ${service_name}');
    }, 60000);
  "
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
# Railway should run as production runtime by default so mcp-use mounts widgets
# in production mode (no dev-time resources directory creation under /app).
export NODE_ENV="${MAPLE_NODE_ENV:-production}"
export MAPLE_DISABLE_TLS="${MAPLE_DISABLE_TLS:-true}"
# In Railway, requests arrive through a trusted edge proxy.
export MAPLE_BEHIND_TRUSTED_PROXY="${MAPLE_BEHIND_TRUSTED_PROXY:-true}"

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
# gRPC TLS material defaults (used by runtime dependency checks).
export MAPLE_GRPC_TLS_CERT="${MAPLE_GRPC_TLS_CERT:-${TLS_DIR}/tls.crt}"
export MAPLE_GRPC_TLS_KEY="${MAPLE_GRPC_TLS_KEY:-${TLS_DIR}/tls.key}"
export MAPLE_GRPC_TLS_CA="${MAPLE_GRPC_TLS_CA:-${TLS_DIR}/ca.crt}"

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
export MCP_PROXY_ADDRESS="${MCP_PROXY_ADDRESS:-localhost:9200}"
export CYBER_PROXY_ADDRESS="${CYBER_PROXY_ADDRESS:-localhost:8090}"
# Note: cyber-proxy defaults to port 8090 to avoid conflict with Railway's PORT (8080)
export AUDIT_WRITER_ADDRESS="${AUDIT_WRITER_ADDRESS:-localhost:9400}"
export MAPLE_MODEL_ROUTER_RETIRED="${MAPLE_MODEL_ROUTER_RETIRED:-true}"
export MAPLE_SECRETS_BROKER_RETIRED="${MAPLE_SECRETS_BROKER_RETIRED:-true}"

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
    # Railway may schedule dependent services asynchronously; do not crash-loop
    # gateway startup on dependency probes.
    export MAPLE_RUNTIME_STRICT_DEPENDENCIES="${MAPLE_RUNTIME_STRICT_DEPENDENCIES:-false}"
    export MAPLE_ENFORCE_STARTUP_DEPENDENCIES="${MAPLE_ENFORCE_STARTUP_DEPENDENCIES:-false}"

    # Admin bootstrap
    export MAPLE_ADMIN_USERNAME="${MAPLE_ADMIN_USERNAME:-admin}"
    export MAPLE_ADMIN_PASSWORD="${MAPLE_ADMIN_PASSWORD:-maple-live-2026}"
    export MAPLE_ADMIN_EMAIL="${MAPLE_ADMIN_EMAIL:-admin@mayple.cloud}"

    # Auth / Session
    export MAPLE_ALLOW_NO_AUTH="${MAPLE_ALLOW_NO_AUTH:-true}"
    export MAPLE_SESSION_COOKIE_DOMAIN="${MAPLE_SESSION_COOKIE_DOMAIN:-.mayple.cloud}"
    export MAPLE_SESSION_COOKIE_NAME="${MAPLE_SESSION_COOKIE_NAME:-maple_session}"
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

    export NODE_OPTIONS="${NODE_OPTIONS:---max-semi-space-size=128 --max-old-space-size=1536}"

    echo "[railway-entrypoint] Starting gateway-api on port ${GATEWAY_PORT}..."
    echo "[railway-entrypoint] DB: ${DATABASE_URL%%@*}@..."
    exec node backend/backendB-core-services/gateway-api/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  admin-console-api)
  # ────────────────────────────────────────────────────────────────────────────
    run_retired_service_stub "admin-console-api" "gateway-api /admin/api/* routes"
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  context-wall)
  # ────────────────────────────────────────────────────────────────────────────
    export CONTEXT_WALL_PORT="${CONTEXT_WALL_PORT:-9000}"
    export CONTEXT_WALL_HOST="${CONTEXT_WALL_HOST:-0.0.0.0}"
    export CONTEXT_WALL_HITL_TIMEOUT_MS="${CONTEXT_WALL_HITL_TIMEOUT_MS:-30000}"

    export NODE_OPTIONS="${NODE_OPTIONS:---max-semi-space-size=32 --max-old-space-size=384}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting context-wall (gRPC=${CONTEXT_WALL_PORT}, health=${PORT:-3000})..."
    exec node backend/backendB-core-services/context-wall/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  mcp-proxy)
  # ────────────────────────────────────────────────────────────────────────────
    export MCP_PROXY_PORT="${MCP_PROXY_PORT:-9200}"
    export MCP_PROXY_HOST="${MCP_PROXY_HOST:-0.0.0.0}"
    export DOWNSTREAM_APPS="${DOWNSTREAM_APPS:-}"
    export MAPLE_DOWNSTREAM_APPS="${MAPLE_DOWNSTREAM_APPS:-}"
    export MAPLE_TOOL_RUNNER_MODE="${MAPLE_TOOL_RUNNER_MODE:-in-process}"
    export MAPLE_TOOL_RUNNER_IMAGE="${MAPLE_TOOL_RUNNER_IMAGE:-none}"
    export MAPLE_TOOL_RUNNER_JOB_NAMESPACE="${MAPLE_TOOL_RUNNER_JOB_NAMESPACE:-default}"

    export NODE_OPTIONS="${NODE_OPTIONS:---max-semi-space-size=32 --max-old-space-size=384}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting mcp-proxy (gRPC=${MCP_PROXY_PORT}, health=${PORT:-3000})..."
    exec node backend/backendB-core-services/mcp-proxy/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  tool-runner)
  # ────────────────────────────────────────────────────────────────────────────
    run_retired_service_stub "tool-runner" "mcp-proxy inlined tool execution"
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

    export NODE_OPTIONS="${NODE_OPTIONS:---max-semi-space-size=32 --max-old-space-size=384}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting cyber-proxy (gRPC=${CYBER_PROXY_PORT}, health=${PORT:-3000})..."
    exec node backend/backendB-core-services/cyber-proxy/service/src/main.js
    ;;

  audit-writer)
  # ────────────────────────────────────────────────────────────────────────────
    export AUDIT_WRITER_PORT="${AUDIT_WRITER_PORT:-9400}"
    export AUDIT_WRITER_HTTP_PORT="${AUDIT_WRITER_HTTP_PORT:-9401}"
    export AUDIT_WRITER_HOST="${AUDIT_WRITER_HOST:-0.0.0.0}"

    export NODE_OPTIONS="${NODE_OPTIONS:---max-semi-space-size=32 --max-old-space-size=384}"

    start_health_sidecar "${PORT:-3000}"
    echo "[railway-entrypoint] Starting audit-writer (gRPC=${AUDIT_WRITER_PORT}, health=${PORT:-3000})..."
    echo "[railway-entrypoint] DB: ${DATABASE_URL%%@*}@..."
    exec node backend/backendB-core-services/audit-writer/service/src/main.js
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  business-api)
  # ────────────────────────────────────────────────────────────────────────────
    run_retired_service_stub "business-api" "gateway-api direct database logic"
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  frontendA)
  # ────────────────────────────────────────────────────────────────────────────
    FRONTEND_PORT="${PORT:-8080}"
    export NODE_ENV=production
    case "${MAPLE_GATEWAY_ORIGIN:-}" in
      *localhost*|*127.0.0.1*)
        echo "[railway-entrypoint] WARN: MAPLE_GATEWAY_ORIGIN points to localhost — overriding to Railway public URL"
        export MAPLE_GATEWAY_ORIGIN="https://maple-gateway-production.up.railway.app"
        ;;
    esac
    echo "[railway-entrypoint] Starting frontendA (IT Console) on port ${FRONTEND_PORT}..."
    cd /app/frontend/frontendA-it-console/template-runtime
    exec npx next start -p "${FRONTEND_PORT}" -H 0.0.0.0
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  frontendB)
  # ────────────────────────────────────────────────────────────────────────────
    FRONTEND_PORT="${PORT:-8080}"
    export NODE_ENV=production
    # Override localhost gateway origins — they can't work inside Railway containers
    case "${MAPLE_GATEWAY_ORIGIN:-}" in
      *localhost*|*127.0.0.1*)
        echo "[railway-entrypoint] WARN: MAPLE_GATEWAY_ORIGIN points to localhost — overriding to Railway public URL"
        export MAPLE_GATEWAY_ORIGIN="https://maple-gateway-production.up.railway.app"
        ;;
    esac
    echo "[railway-entrypoint] Starting frontendB (Desktop App) on port ${FRONTEND_PORT}..."
    cd /app/frontend/frontendB-desktop-app/template-runtime
    exec npx next start -p "${FRONTEND_PORT}" -H 0.0.0.0
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  frontendC)
  # ────────────────────────────────────────────────────────────────────────────
    FRONTEND_PORT="${PORT:-8080}"
    export NODE_ENV=production
    case "${MAPLE_GATEWAY_ORIGIN:-}" in
      *localhost*|*127.0.0.1*)
        echo "[railway-entrypoint] WARN: MAPLE_GATEWAY_ORIGIN points to localhost — overriding to Railway public URL"
        export MAPLE_GATEWAY_ORIGIN="https://maple-gateway-production.up.railway.app"
        ;;
    esac
    echo "[railway-entrypoint] Starting frontendC (Marketing/Download Site) on port ${FRONTEND_PORT}..."
    cd /app/frontend/frontendC-marketing-download-site/template-runtime
    exec npx next start -p "${FRONTEND_PORT}" -H 0.0.0.0
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  model-router)
  # ────────────────────────────────────────────────────────────────────────────
    run_retired_service_stub "model-router" "context-wall"
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  secrets-broker)
  # ────────────────────────────────────────────────────────────────────────────
    run_retired_service_stub "secrets-broker" "gateway-managed secret flows"
    ;;

  # ────────────────────────────────────────────────────────────────────────────
  *)
    echo "[railway-entrypoint] ERROR: Unknown MAPLE_SERVICE='${MAPLE_SERVICE}'"
    echo "Valid values: gateway-api, context-wall, mcp-proxy, cyber-proxy, audit-writer,"
    echo "  frontendA, frontendB, frontendC,"
    echo "  tool-runner(retired), admin-console-api(retired), business-api(retired),"
    echo "  model-router(retired), secrets-broker(retired)"
    exit 1
    ;;
esac
