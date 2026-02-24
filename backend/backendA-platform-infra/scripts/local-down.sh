#!/usr/bin/env bash
set -euo pipefail

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

kill_port 3000
