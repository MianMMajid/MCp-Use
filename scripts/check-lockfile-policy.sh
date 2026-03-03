#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ALLOWED_LOCKFILES=(
  "$ROOT_DIR/package-lock.json"
  "$ROOT_DIR/frontend/frontendA-it-console/template-runtime/package-lock.json"
  "$ROOT_DIR/frontend/frontendB-desktop-app/package-lock.json"
  "$ROOT_DIR/frontend/frontendB-desktop-app/template-runtime/package-lock.json"
  "$ROOT_DIR/frontend/frontendC-marketing-download-site/template-runtime/package-lock.json"
)

for lockfile in "${ALLOWED_LOCKFILES[@]}"; do
  if [ ! -f "$lockfile" ]; then
    printf '[lockfile-policy] Missing required lockfile: %s\n' "$lockfile" >&2
    exit 1
  fi
done

FOUND_LOCKFILES=()
while IFS= read -r lockfile; do
  FOUND_LOCKFILES+=("$lockfile")
done < <(find "$ROOT_DIR" -name "package-lock.json" -type f | sort)

is_allowed_lockfile() {
  local lockfile="$1"
  for allowed in "${ALLOWED_LOCKFILES[@]}"; do
    if [ "$lockfile" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

for lockfile in "${FOUND_LOCKFILES[@]}"; do
  if ! is_allowed_lockfile "$lockfile"; then
    printf '[lockfile-policy] Unexpected lockfile outside approved surfaces: %s\n' "$lockfile" >&2
    exit 1
  fi
done

printf '[lockfile-policy] OK: lockfiles match approved surface policy.\n'
