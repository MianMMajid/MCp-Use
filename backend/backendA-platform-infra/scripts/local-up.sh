#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
cd "${ROOT_DIR}"

LOCAL_OPEN_BROWSER="${LOCAL_OPEN_BROWSER:-1}"

MAPLE_LOCAL_API_KEY="${MAPLE_LOCAL_API_KEY:-local-demo-key}"
MAPLE_LOCAL_ADMIN_USERNAME="${MAPLE_LOCAL_ADMIN_USERNAME:-admin}"
MAPLE_LOCAL_ADMIN_PASSWORD="${MAPLE_LOCAL_ADMIN_PASSWORD:-admin123}"
MAPLE_LOCAL_ADMIN_EMAIL="${MAPLE_LOCAL_ADMIN_EMAIL:-admin@localhost}"

is_port_open() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

if is_port_open 3000; then
  echo "Port 3000 is already in use."
  echo "Run 'npm run local:down' first, then retry."
  exit 1
fi

export MAPLE_API_KEY="${MAPLE_LOCAL_API_KEY}"
export MAPLE_ADMIN_USERNAME="${MAPLE_LOCAL_ADMIN_USERNAME}"
export MAPLE_ADMIN_PASSWORD="${MAPLE_LOCAL_ADMIN_PASSWORD}"
export MAPLE_ADMIN_EMAIL="${MAPLE_LOCAL_ADMIN_EMAIL}"
export MCP_URL="${MCP_URL:-http://localhost:3000}"
export NODE_ENV=development
export MAPLE_ENABLE_JUDGE_UI=true
export MAPLE_ENABLE_DEMO_ROUTES=true
export MAPLE_ALLOW_NO_AUTH="${MAPLE_ALLOW_NO_AUTH:-false}"
export MAPLE_LOCK_BRIDGE_TARGET=false

echo "Starting Maple locally..."
echo "  URL:      http://localhost:3000"
echo "  Judge:    http://localhost:3000/judge"
echo "  Landing:  http://localhost:3000/landing"
echo "  Inspector:http://localhost:3000/inspector"
echo ""
echo "Dashboard login:"
echo "  username: ${MAPLE_ADMIN_USERNAME}"
echo "  password: ${MAPLE_ADMIN_PASSWORD}"
echo ""
echo "MCP/API auth header:"
echo "  x-api-key: ${MAPLE_API_KEY}"
echo ""

if [ "${LOCAL_OPEN_BROWSER}" = "1" ]; then
  (
    sleep 2
    if command -v open >/dev/null 2>&1; then
      open "http://localhost:3000/landing"
      open "http://localhost:3000/judge"
    fi
  ) &
fi

npm run dev
