#!/usr/bin/env bash
set -euo pipefail

# Backward-compatible alias; canonical runtime lives in hackathon-start.sh.
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/hackathon-start.sh"
