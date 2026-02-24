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
    echo "Starting dev for Frontend A (IT / Console)"
    echo "Source: frontend/frontendA-it-console"
    ;;
  frontendB)
    echo "Starting dev for Frontend B (Desktop App UI shell)"
    echo "Source: frontend/frontendB-desktop-app"
    ;;
  frontendC)
    echo "Starting dev for Frontend C (Marketing / Download Site)"
    echo "Source: frontend/frontendC-marketing-download-site"
    ;;
  frontendD)
    echo "Starting dev for Frontend D (MCP Widgets)"
    echo "Source: frontend/frontendD-mcp-widgets"
    ;;
  *)
    echo "Unknown surface: ${SURFACE}"
    echo "Expected one of: frontendA, frontendB, frontendC, frontendD"
    exit 1
    ;;
esac

cd "${ROOT_DIR}"
export MAPLE_ACTIVE_SURFACE="${SURFACE}"
exec npm run dev
