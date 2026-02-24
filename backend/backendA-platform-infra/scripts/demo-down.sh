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

  # Wait up to 2 seconds for graceful shutdown, then SIGKILL
  local waited=0
  while [ "${waited}" -lt 4 ]; do
    sleep 0.5
    waited=$(( waited + 1 ))
    pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN || true)"
    if [ -z "${pids}" ]; then
      echo "Port ${port} is free."
      return 0
    fi
  done

  echo "Process(es) on port ${port} still running — sending SIGKILL: ${pids}"
  kill -9 ${pids} >/dev/null 2>&1 || true
  sleep 0.5

  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN || true)"
  if [ -z "${pids}" ]; then
    echo "Port ${port} is free."
  else
    echo "WARNING: port ${port} still in use after SIGKILL."
  fi
}

kill_port 3000
kill_port 8787
kill_port 19001

echo ""
echo "All demo processes stopped."
