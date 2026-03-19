#!/usr/bin/env bash
set -euo pipefail

maple_repo_root() {
  git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || (
    cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd
  )
}

maple_load_local_env() {
  local root
  root="$(maple_repo_root)"
  if [ -f "${root}/.env" ]; then
    set -a
    # shellcheck disable=SC1090
    source "${root}/.env"
    set +a
  fi
}

maple_load_railway_sync_env() {
  local root
  root="$(maple_repo_root)"
  if [ -f "${root}/.env" ]; then
    set -a
    # shellcheck disable=SC1090
    source "${root}/.env"
    set +a
  fi
  if [ -f "${root}/.env.railway" ]; then
    set -a
    # shellcheck disable=SC1090
    source "${root}/.env.railway"
    set +a
  fi
}

maple_service_key() {
  case "${1}" in
    maple-gateway|gateway|gateway-api) echo "gateway" ;;
    maple-context-wall|context-wall) echo "context-wall" ;;
    maple-mcp-proxy|mcp-proxy) echo "mcp-proxy" ;;
    maple-cyber-proxy|cyber-proxy) echo "cyber-proxy" ;;
    maple-audit-writer|audit-writer) echo "audit-writer" ;;
    maple-frontend-a|frontendA|frontend-a) echo "frontend-a" ;;
    maple-frontend-b|frontendB|frontend-b) echo "frontend-b" ;;
    maple-frontend-c|frontendC|frontend-c) echo "frontend-c" ;;
    maple-tool-runner|tool-runner) echo "tool-runner" ;;
    maple-admin-console|admin-console|admin-console-api) echo "admin-console" ;;
    maple-model-router|model-router) echo "model-router" ;;
    *)
      echo "Unknown service: ${1}" >&2
      return 1
      ;;
  esac
}

maple_service_name() {
  case "$(maple_service_key "${1}")" in
    gateway) echo "maple-gateway" ;;
    context-wall) echo "maple-context-wall" ;;
    mcp-proxy) echo "maple-mcp-proxy" ;;
    cyber-proxy) echo "maple-cyber-proxy" ;;
    audit-writer) echo "maple-audit-writer" ;;
    frontend-a) echo "maple-frontend-a" ;;
    frontend-b) echo "maple-frontend-b" ;;
    frontend-c) echo "maple-frontend-c" ;;
    tool-runner) echo "maple-tool-runner" ;;
    admin-console) echo "maple-admin-console" ;;
    model-router) echo "maple-model-router" ;;
  esac
}

maple_service_runtime_name() {
  case "$(maple_service_key "${1}")" in
    gateway) echo "gateway-api" ;;
    context-wall) echo "context-wall" ;;
    mcp-proxy) echo "mcp-proxy" ;;
    cyber-proxy) echo "cyber-proxy" ;;
    audit-writer) echo "audit-writer" ;;
    frontend-a) echo "frontendA" ;;
    frontend-b) echo "frontendB" ;;
    frontend-c) echo "frontendC" ;;
    tool-runner) echo "tool-runner" ;;
    admin-console) echo "admin-console-api" ;;
    model-router) echo "model-router" ;;
  esac
}

maple_service_container_port() {
  case "$(maple_service_key "${1}")" in
    frontend-a|frontend-b|frontend-c) echo "8080" ;;
    *) echo "3000" ;;
  esac
}

maple_local_host_port() {
  case "$(maple_service_key "${1}")" in
    gateway) echo "3000" ;;
    context-wall) echo "9000" ;;
    mcp-proxy) echo "9200" ;;
    cyber-proxy) echo "8090" ;;
    audit-writer) echo "9401" ;;
    frontend-a) echo "4101" ;;
    frontend-b) echo "4102" ;;
    frontend-c) echo "4103" ;;
    tool-runner) echo "9250" ;;
    admin-console) echo "4001" ;;
    model-router) echo "9100" ;;
  esac
}

maple_emit_common_env() {
  local mode="${1:-railway}"
  local default_db actual_db
  if [ "${mode}" = "local" ]; then
    default_db="postgresql://postgres:postgres@host.docker.internal:5432/railway"
    actual_db="${DATABASE_URL:-${default_db}}"
  else
    default_db="postgresql://postgres:postgres@postgres.railway.internal:5432/railway"
    actual_db="${RAILWAY_DATABASE_URL:-${DATABASE_URL:-${default_db}}}"
  fi
  cat <<EOF
NODE_ENV=production
MAPLE_NODE_ENV=${MAPLE_NODE_ENV:-staging}
DATABASE_URL=${actual_db}
MAPLE_TENANT_CLAIM_SIGNING_KEY=${RAILWAY_MAPLE_TENANT_CLAIM_SIGNING_KEY:-${MAPLE_TENANT_CLAIM_SIGNING_KEY:-railway-dev-signing-key}}
MAPLE_CREDENTIAL_SIGNING_KEY=${RAILWAY_MAPLE_CREDENTIAL_SIGNING_KEY:-${MAPLE_CREDENTIAL_SIGNING_KEY:-replace-me-with-real-key}}
OPENAI_API_KEY=${RAILWAY_OPENAI_API_KEY:-${OPENAI_API_KEY:-not-configured}}
ANTHROPIC_API_KEY=${RAILWAY_ANTHROPIC_API_KEY:-${ANTHROPIC_API_KEY:-not-configured}}
GOOGLE_CLIENT_ID=${RAILWAY_GOOGLE_CLIENT_ID:-${GOOGLE_CLIENT_ID:-not-configured}}
MAPLE_VIRUSTOTAL_API_KEY=${RAILWAY_MAPLE_VIRUSTOTAL_API_KEY:-${MAPLE_VIRUSTOTAL_API_KEY:-not-configured}}
MAPLE_ADMIN_USERNAME=${MAPLE_ADMIN_USERNAME:-admin}
MAPLE_ADMIN_PASSWORD=${MAPLE_ADMIN_PASSWORD:-changeme}
MAPLE_ADMIN_EMAIL=${MAPLE_ADMIN_EMAIL:-admin@mayple.cloud}
MAPLE_DISABLE_TLS=${MAPLE_DISABLE_TLS:-true}
MAPLE_ALLOW_NO_AUTH=${MAPLE_ALLOW_NO_AUTH:-true}
MAPLE_AUTH_ALLOW_SELF_SIGNUP=${MAPLE_AUTH_ALLOW_SELF_SIGNUP:-true}
MAPLE_ENABLE_DEMO_ROUTES=${MAPLE_ENABLE_DEMO_ROUTES:-false}
MAPLE_ENABLE_JUDGE_UI=${MAPLE_ENABLE_JUDGE_UI:-true}
MAPLE_EVENT_TRANSPORT_BACKEND=${MAPLE_EVENT_TRANSPORT_BACKEND:-pg}
MAPLE_BUSINESS_API_BASE_URL=${MAPLE_BUSINESS_API_BASE_URL:- }
MAPLE_BUSINESS_API_REQUIRED=${MAPLE_BUSINESS_API_REQUIRED:-false}
MAPLE_FIREWALL_CHAT_PRIMARY=${MAPLE_FIREWALL_CHAT_PRIMARY:-openai}
MAPLE_MCP_ROUTE_LOCK=${MAPLE_MCP_ROUTE_LOCK:-false}
MAPLE_OTLP_ENDPOINT=${MAPLE_OTLP_ENDPOINT:-disabled}
MAPLE_SESSION_COOKIE_DOMAIN=${MAPLE_SESSION_COOKIE_DOMAIN:- }
CORS_ORIGIN=${CORS_ORIGIN:-*}
EOF
}

maple_emit_shared_mesh_env() {
  local mode="${1:-railway}"
  if [ "${mode}" = "local" ]; then
    cat <<EOF
MAPLE_GATEWAY_ORIGIN=${MAPLE_GATEWAY_ORIGIN:-http://host.docker.internal:3000}
MAPLE_ADMIN_CONSOLE_ORIGIN=${MAPLE_ADMIN_CONSOLE_ORIGIN:-http://host.docker.internal:4001}
CONTEXT_WALL_ADDRESS=${CONTEXT_WALL_ADDRESS:-host.docker.internal:9000}
MCP_PROXY_ADDRESS=${MCP_PROXY_ADDRESS:-host.docker.internal:9200}
CYBER_PROXY_ADDRESS=${CYBER_PROXY_ADDRESS:-host.docker.internal:8090}
AUDIT_WRITER_ADDRESS=${AUDIT_WRITER_ADDRESS:-host.docker.internal:9400}
MODEL_ROUTER_ADDRESS=${MODEL_ROUTER_ADDRESS:-host.docker.internal:9100}
SECRETS_BROKER_ADDRESS=${SECRETS_BROKER_ADDRESS:-host.docker.internal:9300}
TOOL_RUNNER_ADDRESS=${TOOL_RUNNER_ADDRESS:-host.docker.internal:9250}
EOF
  else
    cat <<EOF
CONTEXT_WALL_ADDRESS=${RAILWAY_CONTEXT_WALL_ADDRESS:-maple-context-wall.railway.internal:9000}
MCP_PROXY_ADDRESS=${RAILWAY_MCP_PROXY_ADDRESS:-maple-mcp-proxy.railway.internal:9200}
CYBER_PROXY_ADDRESS=${RAILWAY_CYBER_PROXY_ADDRESS:-maple-cyber-proxy.railway.internal:8090}
AUDIT_WRITER_ADDRESS=${RAILWAY_AUDIT_WRITER_ADDRESS:-maple-audit-writer.railway.internal:9400}
MODEL_ROUTER_ADDRESS=${RAILWAY_MODEL_ROUTER_ADDRESS:-maple-model-router.railway.internal:9100}
SECRETS_BROKER_ADDRESS=${RAILWAY_SECRETS_BROKER_ADDRESS:-maple-secrets-broker.railway.internal:9300}
TOOL_RUNNER_ADDRESS=${RAILWAY_TOOL_RUNNER_ADDRESS:-maple-tool-runner.railway.internal:9250}
EOF
  fi
}

maple_emit_service_env() {
  local service="${1}"
  local mode="${2:-railway}"
  local runtime_name
  runtime_name="$(maple_service_runtime_name "${service}")"
  cat <<EOF
MAPLE_SERVICE=${runtime_name}
EOF
  case "$(maple_service_key "${service}")" in
    gateway)
      cat <<EOF
MAPLE_OPENCLAW_AGENT_ENABLED=${MAPLE_OPENCLAW_AGENT_ENABLED:-true}
MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY=${MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY:-true}
MAPLE_OPENCLAW_AGENT_MODE=${MAPLE_OPENCLAW_AGENT_MODE:-local}
EOF
      if [ "${mode}" = "local" ]; then
        echo "MCP_URL=${MCP_URL:-http://0.0.0.0:8080}"
      else
        echo "MCP_URL=${MCP_URL:-http://0.0.0.0:8080}"
      fi
      ;;
    *)
      cat <<EOF
MAPLE_OPENCLAW_AGENT_ENABLED=false
MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY=false
MAPLE_OPENCLAW_AGENT_MODE=local
EOF
      ;;
  esac
  case "$(maple_service_key "${service}")" in
    frontend-a|frontend-b|frontend-c)
      if [ "${mode}" = "local" ]; then
        echo "MAPLE_GATEWAY_ORIGIN=${MAPLE_GATEWAY_ORIGIN:-http://host.docker.internal:3000}"
      else
        echo "MAPLE_GATEWAY_ORIGIN=${RAILWAY_MAPLE_GATEWAY_ORIGIN:-https://maple-gateway-staging.up.railway.app}"
      fi
      ;;
  esac
}

maple_emit_env_file() {
  local service="${1}"
  local mode="${2:-railway}"
  maple_emit_common_env "${mode}"
  maple_emit_shared_mesh_env "${mode}"
  maple_emit_service_env "${service}" "${mode}"
}

maple_require_railway_sync_env() {
  local missing=0
  for name in MAPLE_TENANT_CLAIM_SIGNING_KEY MAPLE_CREDENTIAL_SIGNING_KEY DATABASE_URL; do
    local value="${!name:-}"
    if [ "${name}" = "DATABASE_URL" ] && [ -n "${RAILWAY_DATABASE_URL:-}" ]; then
      value="${RAILWAY_DATABASE_URL}"
    fi
    if [ "${name}" = "MAPLE_TENANT_CLAIM_SIGNING_KEY" ] && [ -n "${RAILWAY_MAPLE_TENANT_CLAIM_SIGNING_KEY:-}" ]; then
      value="${RAILWAY_MAPLE_TENANT_CLAIM_SIGNING_KEY}"
    fi
    if [ "${name}" = "MAPLE_CREDENTIAL_SIGNING_KEY" ] && [ -n "${RAILWAY_MAPLE_CREDENTIAL_SIGNING_KEY:-}" ]; then
      value="${RAILWAY_MAPLE_CREDENTIAL_SIGNING_KEY}"
    fi
    if [ -z "${value}" ]; then
      echo "Missing required env for Railway sync: ${name}" >&2
      missing=1
    fi
  done
  local cred="${RAILWAY_MAPLE_CREDENTIAL_SIGNING_KEY:-${MAPLE_CREDENTIAL_SIGNING_KEY:-}}"
  local db="${RAILWAY_DATABASE_URL:-${DATABASE_URL:-}}"
  if [ "${cred}" = "replace-me-with-real-key" ]; then
    echo "MAPLE_CREDENTIAL_SIGNING_KEY is still a placeholder" >&2
    missing=1
  fi
  case "${db}" in
    *localhost*|*127.0.0.1*|*host.docker.internal*)
      echo "DATABASE_URL for Railway sync still points to a local host: ${db}" >&2
      missing=1
      ;;
  esac
  if [ "${missing}" = "1" ]; then
    return 1
  fi
}
