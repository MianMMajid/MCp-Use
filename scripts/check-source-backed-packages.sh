#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PACKAGES=(
  "$ROOT_DIR/backend/backendB-core-services/shared/packages/maple-common"
  "$ROOT_DIR/backend/backendB-core-services/shared/packages/maple-persistence"
  "$ROOT_DIR/backend/backendB-core-services/shared/packages/maple-security"
)

fail() {
  printf '[source-backed-guard] %s\n' "$1" >&2
  exit 1
}

for pkg_dir in "${PACKAGES[@]}"; do
  pkg_name="$(basename "$pkg_dir")"
  src_path="$pkg_dir/src"
  dist_path="$pkg_dir/dist"
  stray_dist2="$pkg_dir/dist 2"

  [[ -d "$src_path" ]] || fail "$pkg_name missing src/ directory."
  [[ -L "$dist_path" ]] || fail "$pkg_name dist must be a symlink to src."

  dist_target="$(readlink "$dist_path")"
  [[ "$dist_target" == "src" ]] || fail "$pkg_name dist symlink target must be 'src', found '$dist_target'."

  [[ ! -e "$stray_dist2" ]] || fail "$pkg_name contains stray 'dist 2' entry."
done

printf '[source-backed-guard] OK: source-backed package links are consistent.\n'
