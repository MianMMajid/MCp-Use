#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${MAPLE_DESKTOP_UI_PORT:-4102}"
WEB_URL="${MAPLE_DESKTOP_UI_URL:-http://127.0.0.1:${WEB_PORT}}"

cleanup() {
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "${WEB_PID}" >/dev/null 2>&1; then
    kill "${WEB_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

cd "${ROOT_DIR}"
npm --prefix ./template-runtime run dev -- --port "${WEB_PORT}" &
WEB_PID="$!"

for _ in $(seq 1 120); do
  if curl -fsS "${WEB_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

MAPLE_DESKTOP_UI_URL="${WEB_URL}" electron ./electron/main.cjs
