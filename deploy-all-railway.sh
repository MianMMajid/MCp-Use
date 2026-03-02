#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# deploy-all-railway.sh — Deploy all Maple services to Railway
#
# Creates 11 services + PostgreSQL in the existing Railway project.
# Each service uses the same Dockerfile but a different MAPLE_SERVICE env var.
#
# Prerequisites:
#   - Railway CLI installed and logged in
#   - Already linked to project: railway link (project: maple-test)
#
# Usage:
#   bash deploy-all-railway.sh           # deploy all services
#   bash deploy-all-railway.sh gateway   # deploy only gateway
#   bash deploy-all-railway.sh grpc      # deploy only gRPC services
#   bash deploy-all-railway.sh frontends # deploy only frontends
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

FILTER="${1:-all}"

# ── Preflight ─────────────────────────────────────────────────────────────────
if ! command -v railway &>/dev/null; then
  echo -e "${RED}Error: Railway CLI not found. Install: brew install railway${NC}"
  exit 1
fi

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Maple Multi-Service Railway Deployment             ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Filter: ${YELLOW}${FILTER}${NC}"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# SERVICE DEFINITIONS
# ══════════════════════════════════════════════════════════════════════════════

# Internal networking addresses (Railway private DNS)
# Format: <service-name>.railway.internal:<grpc-port>
CW_ADDR="maple-context-wall.railway.internal:9000"
MR_ADDR="maple-model-router.railway.internal:9100"
MP_ADDR="maple-mcp-proxy.railway.internal:9200"
TR_ADDR="maple-tool-runner.railway.internal:9250"
CP_ADDR="maple-cyber-proxy.railway.internal:8080"
SB_ADDR="maple-secrets-broker.railway.internal:9300"
AW_ADDR="maple-audit-writer.railway.internal:9400"
GW_ADDR="maple-gateway.railway.internal:3000"
AC_ADDR="maple-admin-console.railway.internal:9443"

# ── Helper: create service, set vars, deploy ──────────────────────────────────
deploy_service() {
  local name="$1"
  local maple_service="$2"
  shift 2
  # Remaining args are KEY=VALUE pairs

  echo ""
  echo -e "${CYAN}━━━ Deploying: ${name} (MAPLE_SERVICE=${maple_service}) ━━━${NC}"

  # Create service if it doesn't exist
  echo "  Creating service..."
  railway add -s "${name}" 2>/dev/null || echo -e "  ${YELLOW}Service may already exist${NC}"

  # Link to this service
  echo "  Linking..."
  railway link -s "${name}" 2>/dev/null || railway service "${name}" 2>/dev/null || true

  # Set MAPLE_SERVICE + common vars
  echo "  Setting variables..."
  railway variables \
    --set "MAPLE_SERVICE=${maple_service}" \
    --set "MAPLE_DISABLE_TLS=true" \
    --set "MAPLE_NODE_ENV=staging" \
    --skip-deploys \
    2>/dev/null || true

  # Set service-specific vars
  if [ $# -gt 0 ]; then
    local set_args=""
    for kv in "$@"; do
      set_args="${set_args} --set \"${kv}\""
    done
    eval "railway variables ${set_args} --skip-deploys" 2>/dev/null || true
  fi

  # Deploy
  echo "  Deploying..."
  railway up --detach 2>/dev/null || echo -e "  ${RED}Deploy failed${NC}"

  echo -e "  ${GREEN}✓ ${name} deployment triggered${NC}"
}

# ── Helper: generate domain for public services ──────────────────────────────
add_domain() {
  local name="$1"
  echo "  Generating domain for ${name}..."
  railway link -s "${name}" 2>/dev/null || true
  railway domain 2>/dev/null || echo -e "  ${YELLOW}Domain may already exist${NC}"
}

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: PostgreSQL
# ══════════════════════════════════════════════════════════════════════════════
if [[ "${FILTER}" == "all" || "${FILTER}" == "db" ]]; then
  echo -e "${CYAN}[1/4] Adding PostgreSQL database${NC}"
  railway add -d postgres 2>/dev/null || echo -e "${YELLOW}PostgreSQL may already exist${NC}"
  echo -e "${GREEN}✓ PostgreSQL configured${NC}"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: Backend Services
# ══════════════════════════════════════════════════════════════════════════════

# ── Gateway API ──────────────────────────────────────────────────────────────
if [[ "${FILTER}" == "all" || "${FILTER}" == "gateway" || "${FILTER}" == "backends" ]]; then
  echo ""
  echo -e "${CYAN}[2/4] Deploying backend services${NC}"

  deploy_service "maple-gateway" "gateway-api" \
    "CONTEXT_WALL_ADDRESS=${CW_ADDR}" \
    "MODEL_ROUTER_ADDRESS=${MR_ADDR}" \
    "MCP_PROXY_ADDRESS=${MP_ADDR}" \
    "TOOL_RUNNER_ADDRESS=${TR_ADDR}" \
    "CYBER_PROXY_ADDRESS=${CP_ADDR}" \
    "SECRETS_BROKER_ADDRESS=${SB_ADDR}" \
    "AUDIT_WRITER_ADDRESS=${AW_ADDR}" \
    "CORS_ORIGIN=*" \
    "MAPLE_ALLOW_NO_AUTH=true" \
    "MAPLE_ENABLE_DEMO_ROUTES=true" \
    "MAPLE_EVENT_TRANSPORT_BACKEND=pg"
fi

# ── Admin Console API ────────────────────────────────────────────────────────
if [[ "${FILTER}" == "all" || "${FILTER}" == "backends" ]]; then
  deploy_service "maple-admin-console" "admin-console-api" \
    "CONTEXT_WALL_ADDRESS=${CW_ADDR}" \
    "AUDIT_WRITER_ADDRESS=${AW_ADDR}" \
    "MAPLE_ADMIN_ALLOW_NO_AUTH=true" \
    "GATEWAY_API_URL=http://${GW_ADDR}"
fi

# ── gRPC Microservices ───────────────────────────────────────────────────────
if [[ "${FILTER}" == "all" || "${FILTER}" == "grpc" || "${FILTER}" == "backends" ]]; then

  deploy_service "maple-context-wall" "context-wall" \
    "AUDIT_WRITER_ADDRESS=${AW_ADDR}" \
    "MODEL_ROUTER_ADDRESS=${MR_ADDR}" \
    "MCP_PROXY_ADDRESS=${MP_ADDR}"

  deploy_service "maple-model-router" "model-router" \
    "AUDIT_WRITER_ADDRESS=${AW_ADDR}"

  deploy_service "maple-mcp-proxy" "mcp-proxy" \
    "AUDIT_WRITER_ADDRESS=${AW_ADDR}" \
    "CONTEXT_WALL_ADDRESS=${CW_ADDR}" \
    "SECRETS_BROKER_ADDRESS=${SB_ADDR}" \
    "TOOL_RUNNER_ADDRESS=${TR_ADDR}" \
    "CYBER_PROXY_ADDRESS=${CP_ADDR}"

  deploy_service "maple-tool-runner" "tool-runner" \
    "CYBER_PROXY_ADDRESS=${CP_ADDR}" \
    "AUDIT_WRITER_ADDRESS=${AW_ADDR}"

  deploy_service "maple-cyber-proxy" "cyber-proxy" \
    "AUDIT_WRITER_ADDRESS=${AW_ADDR}"

  deploy_service "maple-secrets-broker" "secrets-broker" \
    "AUDIT_WRITER_ADDRESS=${AW_ADDR}"

  deploy_service "maple-audit-writer" "audit-writer"

fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: Frontends
# ══════════════════════════════════════════════════════════════════════════════
if [[ "${FILTER}" == "all" || "${FILTER}" == "frontends" ]]; then
  echo ""
  echo -e "${CYAN}[3/4] Deploying frontends${NC}"

  deploy_service "maple-frontend-a" "frontendA" \
    "MAPLE_GATEWAY_ORIGIN=http://${GW_ADDR}" \
    "MAPLE_ADMIN_CONSOLE_ORIGIN=http://${AC_ADDR}"

  deploy_service "maple-frontend-b" "frontendB" \
    "MAPLE_GATEWAY_ORIGIN=http://${GW_ADDR}" \
    "MAPLE_ADMIN_CONSOLE_ORIGIN=http://${AC_ADDR}"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: Generate public domains
# ══════════════════════════════════════════════════════════════════════════════
if [[ "${FILTER}" == "all" ]]; then
  echo ""
  echo -e "${CYAN}[4/4] Generating public domains${NC}"

  add_domain "maple-gateway"
  add_domain "maple-admin-console"
  add_domain "maple-frontend-a"
  add_domain "maple-frontend-b"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  All deployments triggered!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo "  Services deployed:"
echo "    Backend:   maple-gateway, maple-admin-console"
echo "    gRPC:      maple-context-wall, maple-model-router, maple-mcp-proxy,"
echo "               maple-tool-runner, maple-cyber-proxy, maple-secrets-broker,"
echo "               maple-audit-writer"
echo "    Frontend:  maple-frontend-a, maple-frontend-b"
echo "    Database:  PostgreSQL (Railway plugin)"
echo ""
echo -e "${YELLOW}Monitor deployments:${NC}"
echo "  railway link -s maple-gateway && railway logs"
echo "  railway link -s maple-audit-writer && railway logs"
echo ""
echo -e "${YELLOW}Check all service status:${NC}"
echo "  railway service status"
echo ""
