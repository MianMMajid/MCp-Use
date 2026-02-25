#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"

BACKEND_RUNTIME_DIR="${ROOT_DIR}/backend/backendB-core-services/maple-monolith"
PUBLIC_DST="${BACKEND_RUNTIME_DIR}/public"
RESOURCES_DST="${BACKEND_RUNTIME_DIR}/resources"
ROOT_NODE_MODULES="${ROOT_DIR}/node_modules"
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

# mcp-use expects project-local node_modules for toolchain resolution.
if [ -d "${ROOT_NODE_MODULES}" ]; then
  ln -sfn "../../../node_modules" "${BACKEND_RUNTIME_DIR}/node_modules"
fi

touch "${PUBLIC_DST}/.gitkeep" "${RESOURCES_DST}/.gitkeep"

if [ -f "${PROTO_GENERATOR}" ]; then
  node "${PROTO_GENERATOR}" >/dev/null
fi

echo "Synced frontend shells to backend runtime assets:"
echo "  ${PUBLIC_DST}    <- frontendA + frontendC"
echo "  ${RESOURCES_DST} <- frontendD"
echo "  backend/proto + backend/backendB-core-services/*/proto <- generated from maple-proto-ts stubs"
