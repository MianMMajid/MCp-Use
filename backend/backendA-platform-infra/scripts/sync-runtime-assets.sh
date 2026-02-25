#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"

RUNTIME_ASSETS_DIR="${ROOT_DIR}/backend/backendA-platform-infra/runtime-assets"
PUBLIC_DST="${RUNTIME_ASSETS_DIR}/public"
RESOURCES_DST="${RUNTIME_ASSETS_DIR}/resources"
PROTO_GENERATOR="${ROOT_DIR}/backend/backendA-platform-infra/scripts/generate-contract-protos.mjs"

FRONTEND_A_PUBLIC="${ROOT_DIR}/frontend/frontendA-it-console/public"
FRONTEND_C_PUBLIC="${ROOT_DIR}/frontend/frontendC-marketing-download-site/public"
FRONTEND_D_RESOURCES="${ROOT_DIR}/frontend/frontendD-mcp-widgets/resources"

copy_tree() {
  local src="$1"
  local dst="$2"
  if [ ! -d "${src}" ]; then
    return 0
  fi
  cp -R "${src}/." "${dst}/"
}

rm -rf "${PUBLIC_DST}" "${RESOURCES_DST}"
mkdir -p "${PUBLIC_DST}" "${RESOURCES_DST}"

copy_tree "${FRONTEND_A_PUBLIC}" "${PUBLIC_DST}"
copy_tree "${FRONTEND_C_PUBLIC}" "${PUBLIC_DST}"
copy_tree "${FRONTEND_D_RESOURCES}" "${RESOURCES_DST}"

touch "${PUBLIC_DST}/.gitkeep" "${RESOURCES_DST}/.gitkeep"

if [ -f "${PROTO_GENERATOR}" ]; then
  node "${PROTO_GENERATOR}" >/dev/null
fi

echo "Synced frontend shells to runtime asset bundle:"
echo "  ${PUBLIC_DST}    <- frontendA + frontendC public assets"
echo "  ${RESOURCES_DST} <- frontendD widget resources"
echo "  backend/proto + backend/backendB-core-services/*/proto <- generated from maple-proto-ts stubs"
