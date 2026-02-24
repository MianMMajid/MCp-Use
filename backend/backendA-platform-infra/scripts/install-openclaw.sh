#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (Node 22+)."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "OpenClaw requires Node 22+. Found Node $(node -v)."
  exit 1
fi

if command -v openclaw >/dev/null 2>&1; then
  echo "OpenClaw already installed: $(openclaw --version)"
  exit 0
fi

echo "Installing OpenClaw globally..."
OPENCLAW_VERSION="${OPENCLAW_VERSION:-latest}"
if [ "${OPENCLAW_VERSION}" = "latest" ]; then
  echo "No OPENCLAW_VERSION set — installing @latest."
  echo "  Tip: pin a version with OPENCLAW_VERSION=x.y.z for reproducible installs."
fi
npm install -g "openclaw@${OPENCLAW_VERSION}"
echo "OpenClaw installed: $(openclaw --version)"
