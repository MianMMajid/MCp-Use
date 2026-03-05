#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  printf '[repo-hygiene] %s\n' "$1" >&2
  exit 1
}

contains_path() {
  local path="$1"
  [ -e "$path" ]
}

check_glob_absent() {
  local pattern="$1"
  if compgen -G "$pattern" >/dev/null; then
    fail "Found forbidden artifact(s): $pattern"
  fi
}

if contains_path "$ROOT_DIR/ERROR"; then
  fail "Found root artifact file: ERROR"
fi

check_glob_absent "$ROOT_DIR/.next.bak.*"
check_glob_absent "$ROOT_DIR/frontend/frontendB-desktop-app/template-runtime/.next.bak.*"

if find "$ROOT_DIR" \
  \( -path "$ROOT_DIR/node_modules" -o -path "$ROOT_DIR/frontend/*/node_modules" \) -prune -o \
  -name 'dist 2' -print -quit | grep -q .; then
  fail "Found stray 'dist 2' package artifact path(s)."
fi

bash "$ROOT_DIR/scripts/check-no-legacy-modifier-endpoints.sh"

if rg -n --no-heading --color=never '@maple/(common|persistence|security)/src/' \
  "$ROOT_DIR/backend" "$ROOT_DIR/frontend" "$ROOT_DIR/tests" >/dev/null; then
  fail "Found direct shared-package deep source import (@maple/*/src/...)."
fi

RETIRED_SERVICES_REGEX='model-router|secrets-broker|tool-runner|admin-console-api|business-api'
REQUIRED_RUNTIME_FILES=(
  "$ROOT_DIR/backend/backendA-platform-infra/scripts/service-mesh-manifest.mjs"
  "$ROOT_DIR/backend/backendA-platform-infra/k8s/deployment.yaml"
  "$ROOT_DIR/backend/backendA-platform-infra/k8s/service.yaml"
  "$ROOT_DIR/backend/backendA-platform-infra/scripts/dev-fast-stack.mjs"
  "$ROOT_DIR/backend/backendB-core-services/gateway-api/service/src/core/runtime-dependencies.js"
)

for target in "${REQUIRED_RUNTIME_FILES[@]}"; do
  if rg -n --no-heading --color=never "$RETIRED_SERVICES_REGEX" "$target" >/dev/null; then
    fail "Retired service reference detected in required runtime file: $target"
  fi
done

printf '[repo-hygiene] OK: repository hygiene checks passed.\n'
