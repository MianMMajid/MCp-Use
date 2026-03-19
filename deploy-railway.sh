#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# deploy-railway.sh — One-shot Maple deployment to Railway
#
# Usage:
#   bash deploy-railway.sh                  # interactive (prompts for project name)
#   bash deploy-railway.sh my-maple-test    # non-interactive
#
# Prerequisites:
#   brew install railway   (or: npm i -g @railway/cli)
#   railway login
#
# What this does:
#   1. Creates a Railway project (or links existing)
#   2. Adds a PostgreSQL plugin
#   3. Sets all required environment variables
#   4. Deploys the Docker image from source
#   5. Prints the public URL
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

# ── Preflight checks ────────────────────────────────────────────────────────
if ! command -v railway &>/dev/null; then
  echo -e "${RED}Error: Railway CLI not found.${NC}"
  echo "Install it with:  brew install railway"
  echo "            or:    npm install -g @railway/cli"
  exit 1
fi

echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        Maple → Railway Deployment               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Check Railway auth ───────────────────────────────────────────────────────
if ! railway whoami &>/dev/null 2>&1; then
  echo -e "${YELLOW}Not logged in to Railway. Opening login...${NC}"
  railway login
fi
echo -e "${GREEN}✓ Logged in as:${NC} $(railway whoami 2>/dev/null || echo 'unknown')"
echo ""

# ── Project name ─────────────────────────────────────────────────────────────
PROJECT_NAME="${1:-}"
if [ -z "${PROJECT_NAME}" ]; then
  read -rp "Project name (default: maple-test): " PROJECT_NAME
  PROJECT_NAME="${PROJECT_NAME:-maple-test}"
fi

# ── Create or link project ───────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[1/5] Setting up Railway project: ${PROJECT_NAME}${NC}"

if railway status &>/dev/null 2>&1; then
  echo -e "${GREEN}✓ Already linked to a Railway project${NC}"
else
  echo "Creating new project..."
  railway init --name "${PROJECT_NAME}" 2>/dev/null || true
  echo -e "${GREEN}✓ Project created${NC}"
fi

# ── Add PostgreSQL ───────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[2/5] Adding PostgreSQL plugin${NC}"
echo -e "${YELLOW}  If prompted, select 'Add PostgreSQL' or skip if already added.${NC}"
railway add --plugin postgresql 2>/dev/null || echo -e "${YELLOW}  PostgreSQL may already exist, continuing...${NC}"
echo -e "${GREEN}✓ PostgreSQL configured${NC}"

# ── Set environment variables ────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[3/5] Setting environment variables${NC}"

# Load user's .env if it exists (for API keys etc)
if [ -f ".env" ]; then
  echo "  Loading values from .env / .env.railway..."
  maple_load_railway_sync_env
fi

cmd=(railway variables --skip-deploys)
while IFS= read -r kv; do
  [ -n "${kv}" ] || continue
  cmd+=(--set "${kv}")
done < <(maple_emit_env_file "maple-gateway" railway)
"${cmd[@]}" 2>/dev/null

echo -e "${GREEN}✓ Environment variables configured${NC}"

# ── Deploy ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[4/5] Deploying to Railway (this will take 5-10 minutes)${NC}"
echo "  Building Docker image from source and pushing..."
echo ""

railway up --detach

echo ""
echo -e "${GREEN}✓ Deployment triggered${NC}"

# ── Print status ─────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[5/5] Deployment status${NC}"
echo ""

# Try to get the domain
DOMAIN=$(railway domain 2>/dev/null || echo "")

echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Maple deployment initiated!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo "  Dashboard:  https://railway.app/dashboard"
echo ""
if [ -n "${DOMAIN}" ]; then
  echo -e "  App URL:    ${CYAN}https://${DOMAIN}${NC}"
  echo "  Health:     https://${DOMAIN}/health"
  echo "  API:        https://${DOMAIN}/api/runtime/status"
fi
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Check build logs:     railway logs --build"
echo "  2. Check runtime logs:   railway logs"
echo "  3. Open in browser:      railway open"
echo "  4. Add custom domain:    railway domain"
echo "  5. View status:          railway status"
echo ""
echo -e "${YELLOW}Optional — set real API keys:${NC}"
echo "  railway variables set OPENAI_API_KEY=sk-..."
echo "  railway variables set ANTHROPIC_API_KEY=sk-ant-..."
echo "  railway variables set STRIPE_SECRET_KEY=sk_live_..."
echo "  railway variables set GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com"
echo ""
echo -e "${YELLOW}Custom domain:${NC}"
echo "  railway domain add maple.yourdomain.com"
echo "  Then add CNAME record: maple.yourdomain.com → <railway-domain>"
echo ""
