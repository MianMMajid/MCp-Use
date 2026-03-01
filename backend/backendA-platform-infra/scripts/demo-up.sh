#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
cd "${ROOT_DIR}"

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
    return
  fi
  node -e 'const { randomBytes } = require("node:crypto"); process.stdout.write(randomBytes(24).toString("hex"));'
}

mask_secret() {
  local raw="$1"
  local len="${#raw}"
  if [ "${len}" -le 10 ]; then
    printf '********'
    return
  fi
  printf '%s...%s' "${raw:0:6}" "${raw: -4}"
}

OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-19001}"
OPENCLAW_GATEWAY_WS_URL="${OPENCLAW_GATEWAY_WS_URL:-ws://127.0.0.1:${OPENCLAW_GATEWAY_PORT}}"
OPENCLAW_GATEWAY_SESSION_KEY="${OPENCLAW_GATEWAY_SESSION_KEY:-agent-dev-main}"
OPENCLAW_BRIDGE_PORT="${OPENCLAW_BRIDGE_PORT:-8787}"
OPENCLAW_BRIDGE_TOKEN="${OPENCLAW_BRIDGE_TOKEN:-$(generate_secret)}"
OPENCLAW_BRIDGE_MODE="${OPENCLAW_BRIDGE_MODE:-gateway}"
MAPLE_API_KEY="${MAPLE_API_KEY:-$(generate_secret)}"
DEMO_OPEN_BROWSER="${DEMO_OPEN_BROWSER:-1}"
MAPLE_PRINT_SECRETS="${MAPLE_PRINT_SECRETS:-0}"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "OpenClaw CLI not found."
  echo "Run: ./backend/backendA-platform-infra/scripts/install-openclaw.sh"
  exit 1
fi

is_port_open() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

OPENCLAW_PID=""
BRIDGE_PID=""

cleanup() {
  if [ -n "${BRIDGE_PID}" ] && kill -0 "${BRIDGE_PID}" >/dev/null 2>&1; then
    kill "${BRIDGE_PID}" >/dev/null 2>&1 || true
  fi
  if [ -n "${OPENCLAW_PID}" ] && kill -0 "${OPENCLAW_PID}" >/dev/null 2>&1; then
    kill "${OPENCLAW_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# ─── Start OpenClaw Gateway ──────────────────────────────────────────────────
# Let the gateway use its own config token (or generate one on first run).
# After it starts, we read the real token from config so the bridge can auth.
if is_port_open "${OPENCLAW_GATEWAY_PORT}"; then
  echo "OpenClaw gateway already running on port ${OPENCLAW_GATEWAY_PORT}."
else
  echo "Starting OpenClaw gateway on ws://127.0.0.1:${OPENCLAW_GATEWAY_PORT} ..."
  openclaw --dev gateway run \
    --port "${OPENCLAW_GATEWAY_PORT}" \
    --allow-unconfigured \
    --verbose \
    >"${ROOT_DIR}/.openclaw-gateway.log" 2>&1 &
  OPENCLAW_PID=$!
  echo "Waiting for OpenClaw gateway to become ready ..."
  _waited=0
  while ! is_port_open "${OPENCLAW_GATEWAY_PORT}"; do
    sleep 0.5
    _waited=$(( _waited + 1 ))
    if [ "${_waited}" -ge 60 ]; then
      echo "ERROR: OpenClaw gateway did not start within 30 seconds." >&2
      echo "Check ${ROOT_DIR}/.openclaw-gateway.log for details." >&2
      exit 1
    fi
  done
  echo "OpenClaw gateway is ready (port ${OPENCLAW_GATEWAY_PORT})."
fi

# Read the gateway's real auth token from its config so the bridge can authenticate.
OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"
if [ -z "${OPENCLAW_GATEWAY_TOKEN}" ]; then
  OPENCLAW_GATEWAY_TOKEN="$(openclaw --dev config get gateway.auth.token 2>/dev/null || true)"
fi
if [ -z "${OPENCLAW_GATEWAY_TOKEN}" ]; then
  echo "WARNING: Could not read gateway auth token from config. Bridge may fail to connect." >&2
  OPENCLAW_GATEWAY_TOKEN="$(generate_secret)"
fi

export OPENCLAW_BRIDGE_URL="${OPENCLAW_BRIDGE_URL:-http://127.0.0.1:${OPENCLAW_BRIDGE_PORT}}"
export OPENCLAW_BRIDGE_TOKEN
export MAPLE_API_KEY
export OPENCLAW_GATEWAY_WS_URL
export OPENCLAW_GATEWAY_TOKEN
export OPENCLAW_GATEWAY_SESSION_KEY
export OPENCLAW_BRIDGE_MODE
export MAPLE_DEMO_URL="http://localhost:${PORT:-3000}"

DEMO_SECRETS_FILE="${ROOT_DIR}/.demo-secrets.env"
cat >"${DEMO_SECRETS_FILE}" <<EOF
MAPLE_API_KEY=${MAPLE_API_KEY}
MAPLE_DEMO_URL=${MAPLE_DEMO_URL}
OPENCLAW_BRIDGE_TOKEN=${OPENCLAW_BRIDGE_TOKEN}
OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}
EOF
chmod 600 "${DEMO_SECRETS_FILE}" || true

if is_port_open "${OPENCLAW_BRIDGE_PORT}"; then
  echo "OpenClaw bridge adapter already running on port ${OPENCLAW_BRIDGE_PORT}."
else
  echo "Starting hardcoded OpenClaw bridge adapter on http://127.0.0.1:${OPENCLAW_BRIDGE_PORT} ..."
  OPENCLAW_BRIDGE_PORT="${OPENCLAW_BRIDGE_PORT}" OPENCLAW_BRIDGE_TOKEN="${OPENCLAW_BRIDGE_TOKEN}" \
    OPENCLAW_BRIDGE_MODE="${OPENCLAW_BRIDGE_MODE}" \
    OPENCLAW_GATEWAY_WS_URL="${OPENCLAW_GATEWAY_WS_URL}" \
    OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN}" \
    OPENCLAW_GATEWAY_SESSION_KEY="${OPENCLAW_GATEWAY_SESSION_KEY}" \
    node "${SCRIPT_DIR}/openclaw-bridge-hardcoded.mjs" \
    >"${ROOT_DIR}/.openclaw-bridge.log" 2>&1 &
  BRIDGE_PID=$!
  echo "Waiting for bridge adapter to become ready ..."
  _waited=0
  while ! is_port_open "${OPENCLAW_BRIDGE_PORT}"; do
    sleep 0.5
    _waited=$(( _waited + 1 ))
    if [ "${_waited}" -ge 20 ]; then
      echo "ERROR: Bridge adapter did not start within 10 seconds." >&2
      echo "Check ${ROOT_DIR}/.openclaw-bridge.log for details." >&2
      exit 1
    fi
  done
  echo "Bridge adapter is ready (port ${OPENCLAW_BRIDGE_PORT})."
fi

echo ""
echo "Demo config:"
if [ "${MAPLE_PRINT_SECRETS}" = "1" ]; then
  echo "  MAPLE_API_KEY=${MAPLE_API_KEY}"
  echo "  OPENCLAW_BRIDGE_TOKEN=${OPENCLAW_BRIDGE_TOKEN}"
  echo "  OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}"
else
  echo "  MAPLE_API_KEY=$(mask_secret "${MAPLE_API_KEY}")"
  echo "  OPENCLAW_BRIDGE_TOKEN=$(mask_secret "${OPENCLAW_BRIDGE_TOKEN}")"
  echo "  OPENCLAW_GATEWAY_TOKEN=$(mask_secret "${OPENCLAW_GATEWAY_TOKEN}")"
fi
echo "  OPENCLAW_BRIDGE_URL=${OPENCLAW_BRIDGE_URL}"
echo "  OPENCLAW_BRIDGE_MODE=${OPENCLAW_BRIDGE_MODE}"
echo "  OPENCLAW_GATEWAY_WS_URL=${OPENCLAW_GATEWAY_WS_URL}"
echo "  OPENCLAW_GATEWAY_SESSION_KEY=${OPENCLAW_GATEWAY_SESSION_KEY}"
echo "  MAPLE_DEMO_URL=${MAPLE_DEMO_URL}"
echo "  OPENCLAW gateway: ws://127.0.0.1:${OPENCLAW_GATEWAY_PORT}"
echo "  Secrets file: ${DEMO_SECRETS_FILE}"
echo ""
echo "Open these in browser:"
echo "  Judge GUI:   ${MAPLE_DEMO_URL}/judge"
echo "  Inspector:   ${MAPLE_DEMO_URL}/inspector"
echo ""
echo "To run the automated demo in another terminal:"
echo "  source .demo-secrets.env && npm run demo:run"
echo ""

if [ "${DEMO_OPEN_BROWSER}" = "1" ]; then
  (
    sleep 3
    if command -v open >/dev/null 2>&1; then
      open "${MAPLE_DEMO_URL}/judge"
      open "${MAPLE_DEMO_URL}/inspector"
    fi
  ) &
fi

npm run dev
