#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"
SURFACE="${1:-}"

if [ -z "${SURFACE}" ]; then
  echo "Usage: bash backend/backendA-platform-infra/scripts/dev-surface.sh <frontendA|frontendB|frontendC|frontendD>"
  exit 1
fi

case "${SURFACE}" in
  frontendA)
    echo "Starting template runtime for Frontend A (IT / Console) on :4101"
    cd "${ROOT_DIR}"
    exec npm --prefix frontend/frontendA-it-console/template-runtime run dev -- --port 4101
    ;;
  frontendB)
    echo "Starting template runtime for Frontend B (Desktop App) on :4102"
    cd "${ROOT_DIR}"
    exec npm --prefix frontend/frontendB-desktop-app/template-runtime run dev -- --port 4102
    ;;
  frontendC)
    echo "Starting template runtime for Frontend C (Marketing / Download Site) on :4103"
    cd "${ROOT_DIR}"
    exec npm --prefix frontend/frontendC-marketing-download-site/template-runtime run dev -- --port 4103
    ;;
  frontendD)
    echo "Starting dev for Frontend D (MCP Widgets)"
    echo "Source: frontend/frontendD-mcp-widgets/resources"
    echo "Serving on :3400 via static-server with /api proxy to gateway :3000"
    cd "${ROOT_DIR}"
    exec node backend/backendA-platform-infra/scripts/static-server.mjs \
      --root "${ROOT_DIR}/frontend/frontendD-mcp-widgets/resources" \
      --port 3400 \
      --proxy-target "http://127.0.0.1:3000" \
      --proxy-prefix /api
    ;;
  *)
    echo "Unknown surface: ${SURFACE}"
    echo "Expected one of: frontendA, frontendB, frontendC, frontendD"
    exit 1
    ;;
esac
