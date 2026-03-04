#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATTERN='openclaw/modifier/(ops|observability|approvals)'

ALLOWLIST=(
  "$ROOT_DIR/backend/backendB-core-services/gateway-api/service/src/routes/openclaw-modifier-observability-routes.js"
  "$ROOT_DIR/backend/backendB-core-services/gateway-api/service/src/routes/openclaw-modifier-ops-routes.js"
  "$ROOT_DIR/backend/backendB-core-services/gateway-api/service/src/routes/openclaw-modifier-routes.js"
  "$ROOT_DIR/backend/backendB-core-services/gateway-api/service/src/routes/modifier-approval-watch.js"
  "$ROOT_DIR/frontend/frontendB-desktop-app/template-runtime/scripts/check-orchestration-surface.js"
)

is_allowlisted() {
  local file="$1"
  local content="$2"
  for allowed in "${ALLOWLIST[@]}"; do
    if [[ "$file" == "$allowed" ]]; then
      return 0
    fi
  done

  # Explicit 410-removal assertions are allowed in dedicated tests.
  if [[ "$file" == *"/tests/"* ]] && [[ "$content" == *"Endpoint removed"* ]]; then
    return 0
  fi

  return 1
}

violations=()
while IFS= read -r hit; do
  [[ -z "$hit" ]] && continue
  file="${hit%%:*}"
  rest="${hit#*:}"
  content="${rest#*:}"
  if is_allowlisted "$file" "$content"; then
    continue
  fi
  violations+=("$hit")
done < <(rg -n --no-heading --color=never "$PATTERN" "$ROOT_DIR" || true)

if (( ${#violations[@]} > 0 )); then
  printf '[legacy-endpoint-guard] Found non-allowlisted legacy modifier endpoints:\n'
  printf '%s\n' "${violations[@]}"
  exit 1
fi

printf '[legacy-endpoint-guard] OK: no non-allowlisted legacy modifier endpoint strings found.\n'
