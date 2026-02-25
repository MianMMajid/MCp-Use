#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${MAPLE_K8S_NAMESPACE:-maple}"

FORWARDS=(
  "gateway-api:3000:3000"
  "frontend-a-it-console:3100:8080"
  "frontend-b-desktop-app:3200:8080"
  "frontend-c-marketing-site:3300:8080"
  "frontend-d-mcp-widgets:3400:8080"
  "openclaw-bridge:4010:8787"
  "openclaw-gateway:4011:19001"
  "admin-console-api:4001:8080"
  "context-wall:4002:8080"
  "model-router:4003:8080"
  "mcp-proxy:4004:8080"
  "cyber-proxy:4005:8080"
  "tool-runner:4006:8080"
  "audit-writer:4007:8080"
  "secrets-broker:4008:8080"
)

PORT_FORWARD_PIDS=()

is_port_open() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  return 1
}

cleanup() {
  for pid in "${PORT_FORWARD_PIDS[@]}"; do
    if kill -0 "${pid}" >/dev/null 2>&1; then
      kill "${pid}" >/dev/null 2>&1 || true
    fi
  done
}

trap cleanup EXIT INT TERM

start_forward() {
  local svc="$1"
  local local_port="$2"
  local target_port="$3"

  if is_port_open "${local_port}"; then
    echo "Skipping ${svc}: local port ${local_port} is already in use."
    return
  fi

  kubectl -n "${NAMESPACE}" port-forward "svc/${svc}" "${local_port}:${target_port}" >/tmp/maple-pf-"${svc}".log 2>&1 &
  PORT_FORWARD_PIDS+=("$!")
  echo "Forwarding ${svc}: localhost:${local_port} -> ${target_port}"
}

echo "Starting port-forwards for namespace ${NAMESPACE}"
for entry in "${FORWARDS[@]}"; do
  IFS=":" read -r svc local_port target_port <<<"${entry}"
  start_forward "${svc}" "${local_port}" "${target_port}"
done

echo ""
echo "Frontend endpoints:"
echo "  http://localhost:3000  -> gateway-api (judge/inspector/API)"
echo "  http://localhost:3100  -> frontendA-it-console"
echo "  http://localhost:3200  -> frontendB-desktop-app"
echo "  http://localhost:3300  -> frontendC-marketing-site"
echo "  http://localhost:3400  -> frontendD-mcp-widgets"
echo ""
echo "Backend shell endpoints:"
echo "  http://localhost:4001  -> admin-console-api"
echo "  http://localhost:4002  -> context-wall"
echo "  http://localhost:4003  -> model-router"
echo "  http://localhost:4004  -> mcp-proxy"
echo "  http://localhost:4005  -> cyber-proxy"
echo "  http://localhost:4006  -> tool-runner"
echo "  http://localhost:4007  -> audit-writer"
echo "  http://localhost:4008  -> secrets-broker"
echo ""
echo "OpenClaw endpoints:"
echo "  http://localhost:4010/health -> openclaw-bridge"
echo "  ws://localhost:4011          -> openclaw-gateway"
echo ""
echo "Press Ctrl+C to stop all port-forwards."

wait
