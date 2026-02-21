#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# Load local env overrides (including Slack credentials) for both toolhub and Maple.
if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

HACKATHON_OPEN_BROWSER="${HACKATHON_OPEN_BROWSER:-1}"
MAPLE_TOOLHUB_PORT="${MAPLE_TOOLHUB_PORT:-8788}"
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
  echo "Run 'npm run hackathon:down' first, then retry."
  exit 1
fi

if is_port_open "${MAPLE_TOOLHUB_PORT}"; then
  echo "Port ${MAPLE_TOOLHUB_PORT} is already in use."
  echo "Set MAPLE_TOOLHUB_PORT to another value, or stop the current process."
  exit 1
fi

mkdir -p "${ROOT_DIR}/.mcp-use"
TOOLHUB_LOG="${ROOT_DIR}/.mcp-use/hackathon-toolhub.log"
TOOLHUB_PID_FILE="${ROOT_DIR}/.mcp-use/hackathon-toolhub.pid"

cleanup() {
  if [ -f "${TOOLHUB_PID_FILE}" ]; then
    local pid
    pid="$(cat "${TOOLHUB_PID_FILE}" || true)"
    if [ -n "${pid}" ] && kill -0 "${pid}" >/dev/null 2>&1; then
      kill "${pid}" >/dev/null 2>&1 || true
    fi
    rm -f "${TOOLHUB_PID_FILE}"
  fi
}
trap cleanup EXIT

node scripts/hackathon-toolhub.mjs >"${TOOLHUB_LOG}" 2>&1 &
TOOLHUB_PID=$!
echo "${TOOLHUB_PID}" > "${TOOLHUB_PID_FILE}"
sleep 0.6

if ! kill -0 "${TOOLHUB_PID}" >/dev/null 2>&1; then
  echo "Failed to start hackathon toolhub."
  echo "Last logs:"
  tail -n 50 "${TOOLHUB_LOG}" || true
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
export MAPLE_ALLOW_NO_AUTH=false
export MAPLE_LOCK_BRIDGE_TARGET=false

export MAPLE_MCP_MARKETPLACE_ENABLED=false
export MAPLE_MCP_MARKETPLACE_AUTO_CONNECT=false
export MAPLE_MCP_ROUTE_LOCK=true
export MAPLE_MCP_FIREWALL_DEFAULT_APP=toolhub
export MAPLE_MCP_EXECUTION_ORDER=toolhub
export MAPLE_DOWNSTREAM_APPS="[{\"id\":\"toolhub\",\"name\":\"Hackathon Toolhub\",\"description\":\"Curated local MCP tools for web, wiki, github, weather, research, books, news, and Slack messaging\",\"mcpUrl\":\"http://127.0.0.1:${MAPLE_TOOLHUB_PORT}/mcp\",\"enabled\":true,\"timeoutMs\":15000,\"authHeader\":\"authorization\",\"authScheme\":\"raw\",\"toolAllowlist\":[\"web_search\",\"web_fetch\",\"wikipedia_summary\",\"github_repo_info\",\"weather_forecast\",\"slack_post_message\",\"hn_search\",\"arxiv_search\",\"openlibrary_search\"]}]"

echo "Starting Maple hackathon gateway..."
echo "  Maple URL:   http://localhost:3000"
echo "  Toolhub URL: http://127.0.0.1:${MAPLE_TOOLHUB_PORT}/mcp"
echo "  Judge:       http://localhost:3000/judge"
echo "  Inspector:   http://localhost:3000/inspector"
echo ""
echo "Gateway mode:"
echo "  routeLock:   true"
echo "  default app: toolhub"
echo "  tools:       web_search, web_fetch, wikipedia_summary, github_repo_info, weather_forecast, slack_post_message, hn_search, arxiv_search, openlibrary_search"
echo ""
echo "Dashboard login:"
echo "  username: ${MAPLE_ADMIN_USERNAME}"
echo "  password: ${MAPLE_ADMIN_PASSWORD}"
echo ""
echo "MCP/API auth header:"
echo "  x-api-key: ${MAPLE_API_KEY}"
echo ""

if [ "${HACKATHON_OPEN_BROWSER}" = "1" ]; then
  (
    sleep 2
    if command -v open >/dev/null 2>&1; then
      open "http://localhost:3000/landing"
      open "http://localhost:3000/judge"
    fi
  ) &
fi

npm run dev
