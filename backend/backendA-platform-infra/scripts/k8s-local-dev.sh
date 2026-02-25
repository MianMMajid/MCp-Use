#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "${SCRIPT_DIR}/k8s-local-up.sh"
echo ""
echo "Starting port-forwards for all services..."
exec bash "${SCRIPT_DIR}/k8s-local-port-forward.sh"
