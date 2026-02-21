#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

MAPLE_TOOLHUB_PORT="${MAPLE_TOOLHUB_PORT:-8788}"
TOOLHUB_PID_FILE="${ROOT_DIR}/.mcp-use/hackathon-toolhub.pid"

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN || true)"
  if [ -z "${pids}" ]; then
    echo "No process listening on port ${port}."
    return 0
  fi
  echo "Stopping process(es) on port ${port}: ${pids}"
  kill ${pids} >/dev/null 2>&1 || true
}

if [ -f "${TOOLHUB_PID_FILE}" ]; then
  pid="$(cat "${TOOLHUB_PID_FILE}" || true)"
  if [ -n "${pid}" ] && kill -0 "${pid}" >/dev/null 2>&1; then
    echo "Stopping hackathon toolhub pid ${pid}."
    kill "${pid}" >/dev/null 2>&1 || true
  fi
  rm -f "${TOOLHUB_PID_FILE}"
fi

kill_port 3000
kill_port "${MAPLE_TOOLHUB_PORT}"
