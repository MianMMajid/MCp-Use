#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PORT_FORWARD_PID=""
LOG_STREAM_PID=""

cleanup() {
  if [ -n "${LOG_STREAM_PID}" ] && kill -0 "${LOG_STREAM_PID}" >/dev/null 2>&1; then
    kill "${LOG_STREAM_PID}" >/dev/null 2>&1 || true
  fi
  if [ -n "${PORT_FORWARD_PID}" ] && kill -0 "${PORT_FORWARD_PID}" >/dev/null 2>&1; then
    kill "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

bash "${SCRIPT_DIR}/k8s-local-up.sh"
echo ""
bash "${SCRIPT_DIR}/k8s-local-status.sh"
echo ""

echo "Starting unified services for full stack..."
bash "${SCRIPT_DIR}/k8s-local-port-forward.sh" &
PORT_FORWARD_PID="$!"
sleep 2
bash "${SCRIPT_DIR}/k8s-logs-aggregate.sh" &
LOG_STREAM_PID="$!"

echo ""
echo "Full stack is live."
echo "Press Ctrl+C to stop port-forwards and log streaming."

while true; do
  if ! kill -0 "${PORT_FORWARD_PID}" >/dev/null 2>&1; then
    echo "Port-forward process exited unexpectedly."
    exit 1
  fi
  if ! kill -0 "${LOG_STREAM_PID}" >/dev/null 2>&1; then
    echo "Log stream process exited unexpectedly."
    exit 1
  fi
  sleep 2
done
