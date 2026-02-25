#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Monolith runtime has been removed."
echo "Starting the full Kubernetes service mesh for hackathon mode..."

exec bash "${SCRIPT_DIR}/k8s-local-all.sh"
