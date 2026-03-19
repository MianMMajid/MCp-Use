#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# deploy-all-railway.sh — Deploy all Maple services to Railway
#
# Creates 5 backend services + frontends + PostgreSQL in the existing Railway project.
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
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/backend/backendA-platform-infra/scripts/lib/railway-env.sh"

FILTER="${1:-all}"
maple_load_railway_sync_env

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

# ── Helper: create service, set vars, deploy ──────────────────────────────────
deploy_service() {
  local name="$1"

  echo ""
  echo -e "${CYAN}━━━ Deploying: ${name} (MAPLE_SERVICE=$(maple_service_runtime_name "${name}")) ━━━${NC}"

  # Create service if it doesn't exist
  echo "  Creating service..."
  railway add -s "${name}" 2>/dev/null || echo -e "  ${YELLOW}Service may already exist${NC}"

  # Link to this service
  echo "  Linking..."
  railway link -s "${name}" 2>/dev/null || railway service "${name}" 2>/dev/null || true

  # Set MAPLE_SERVICE + common vars
  echo "  Setting variables..."
  local cmd=(railway variables --skip-deploys)
  while IFS= read -r kv; do
    [ -n "${kv}" ] || continue
    cmd+=(--set "${kv}")
  done < <(maple_emit_env_file "${name}" railway)
  "${cmd[@]}" 2>/dev/null || true

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

  deploy_service "maple-gateway"
fi

# ── gRPC Microservices ───────────────────────────────────────────────────────
if [[ "${FILTER}" == "all" || "${FILTER}" == "grpc" || "${FILTER}" == "backends" ]]; then

  deploy_service "maple-context-wall"
  deploy_service "maple-mcp-proxy"
  deploy_service "maple-cyber-proxy"
  deploy_service "maple-audit-writer"

fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: Frontends
# ══════════════════════════════════════════════════════════════════════════════
if [[ "${FILTER}" == "all" || "${FILTER}" == "frontends" ]]; then
  echo ""
  echo -e "${CYAN}[3/4] Deploying frontends${NC}"

  deploy_service "maple-frontend-a"
  deploy_service "maple-frontend-b"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: Generate public domains
# ══════════════════════════════════════════════════════════════════════════════
if [[ "${FILTER}" == "all" ]]; then
  echo ""
  echo -e "${CYAN}[4/4] Generating public domains${NC}"

  add_domain "maple-gateway"
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
echo "    Backend:   maple-gateway"
echo "    gRPC:      maple-context-wall, maple-mcp-proxy,"
echo "               maple-cyber-proxy, maple-audit-writer"
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
