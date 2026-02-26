#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Stopping hackathon mesh stack..."
exec bash "${SCRIPT_DIR}/k8s-local-down.sh" "$@"
