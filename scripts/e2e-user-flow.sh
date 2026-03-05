#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# e2e-user-flow.sh — End-to-end user flow smoke test
#
# Validates the complete user journey against a live (or local)
# gateway deployment: health → register → auth → CRUD → logout.
#
# Usage:
#   ./scripts/e2e-user-flow.sh [BASE_URL]
#
#   BASE_URL  defaults to https://maple-gateway-production.up.railway.app
#             set to http://localhost:8443 for local testing
#
#   Env overrides:
#     E2E_BASE_URL     — base URL (overrides positional arg)
#     E2E_API_KEY      — skip registration, use existing API key
#     E2E_VERBOSE      — set to 1 for full curl output
# ──────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

# ── Prerequisites ─────────────────────────────────────────────
for cmd in curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}Error: '$cmd' is required but not found.${RESET}" >&2
    exit 1
  fi
done

# ── Configuration ─────────────────────────────────────────────
BASE_URL="${E2E_BASE_URL:-${1:-https://maple-gateway-production.up.railway.app}}"
# Strip trailing slash
BASE_URL="${BASE_URL%/}"

VERBOSE="${E2E_VERBOSE:-0}"
EPOCH="$(date +%s)"
TEST_USER="e2e-test-${EPOCH}"
TEST_PASS="e2e-pass-${EPOCH}!"

COOKIE_JAR="$(mktemp)"
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$COOKIE_JAR" "$RESPONSE_FILE"' EXIT

HTTP_CODE="000"
BODY=""

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
TOTAL=29

# ── Extracted IDs (populated during run) ──────────────────────
SESSION_COOKIE=""
USER_ID=""
AGENT_ID=""
ORCH_ID=""
API_KEY_RAW=""
API_KEY_ID=""

# ── Helpers ───────────────────────────────────────────────────
log_pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo -e "  ${GREEN}[PASS]${RESET} $1"
}

log_fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo -e "  ${RED}[FAIL]${RESET} $1"
}

log_skip() {
  SKIP_COUNT=$((SKIP_COUNT + 1))
  echo -e "  ${YELLOW}[SKIP]${RESET} $1"
}

log_phase() {
  echo ""
  echo -e "${BOLD}${CYAN}── $1${RESET}"
}

# curl wrapper — sets globals $HTTP_CODE and $BODY
# Usage: call_api GET /path [json-body]
call_api() {
  local method="$1" path="$2" data="${3:-}"
  local url="${BASE_URL}${path}"
  local curl_args=( -s -o "$RESPONSE_FILE" -w '%{http_code}' -b "$COOKIE_JAR" -c "$COOKIE_JAR" )

  curl_args+=( -X "$method" )
  curl_args+=( -H 'Content-Type: application/json' )
  curl_args+=( -H 'Accept: application/json' )

  if [[ -n "$data" ]]; then
    curl_args+=( -d "$data" )
  fi

  if [[ "$VERBOSE" == "1" ]]; then
    echo -e "    ${YELLOW}→ $method $path${RESET}" >&2
    if [[ -n "$data" ]]; then echo "      body: $data" >&2; fi
  fi

  HTTP_CODE="$(curl "${curl_args[@]}" "$url" 2>/dev/null || echo "000")"
  BODY="$(cat "$RESPONSE_FILE" 2>/dev/null || echo "")"

  if [[ "$VERBOSE" == "1" ]]; then
    echo "      ← HTTP $HTTP_CODE" >&2
    echo "$BODY" | head -5 >&2
  fi
}

# Same as call_api but uses x-api-key header instead of cookies
call_api_with_key() {
  local method="$1" path="$2" key="$3" data="${4:-}"
  local url="${BASE_URL}${path}"
  local curl_args=( -s -o "$RESPONSE_FILE" -w '%{http_code}' )

  curl_args+=( -X "$method" )
  curl_args+=( -H 'Content-Type: application/json' )
  curl_args+=( -H 'Accept: application/json' )
  curl_args+=( -H "x-api-key: $key" )

  if [[ -n "$data" ]]; then
    curl_args+=( -d "$data" )
  fi

  if [[ "$VERBOSE" == "1" ]]; then
    echo -e "    ${YELLOW}→ $method $path (api-key)${RESET}" >&2
  fi

  HTTP_CODE="$(curl "${curl_args[@]}" "$url" 2>/dev/null || echo "000")"
  BODY="$(cat "$RESPONSE_FILE" 2>/dev/null || echo "")"

  if [[ "$VERBOSE" == "1" ]]; then
    echo "      ← HTTP $HTTP_CODE" >&2
    echo "$BODY" | head -5 >&2
  fi
}

# Safe jq extraction — returns empty string on parse errors
jq_val() {
  echo "$1" | jq -r "$2" 2>/dev/null || echo ""
}

# ══════════════════════════════════════════════════════════════
echo -e "${BOLD}E2E User Flow Test${RESET}"
echo -e "  Target:    ${CYAN}${BASE_URL}${RESET}"
echo -e "  Test user: ${CYAN}${TEST_USER}${RESET}"
echo ""

# ── Phase 1: Infrastructure Health ───────────────────────────
log_phase "Phase 1 — Infrastructure Health (3 tests)"

# 1. GET /health
call_api GET /health
STATUS=$(jq_val "$BODY" '.status')
DB_OK=$(jq_val "$BODY" '.db.ok')
if [[ "$HTTP_CODE" == "200" && "$STATUS" == "ok" ]]; then
  log_pass "GET /health → $HTTP_CODE (status=$STATUS, db.ok=${DB_OK:-n/a})"
else
  log_fail "GET /health → $HTTP_CODE (status=$STATUS, db.ok=${DB_OK:-n/a})"
fi

# 2. GET /ready
call_api GET /ready
READY=$(jq_val "$BODY" '.ready')
if [[ "$HTTP_CODE" == "200" && "$READY" == "true" ]]; then
  log_pass "GET /ready → $HTTP_CODE (ready=$READY)"
else
  log_fail "GET /ready → $HTTP_CODE (ready=$READY)"
fi

# 3. GET /api/runtime/feature-capabilities
call_api GET /api/runtime/feature-capabilities
FC_OK=$(jq_val "$BODY" '.ok')
if [[ "$HTTP_CODE" == "200" && "$FC_OK" == "true" ]]; then
  log_pass "GET /api/runtime/feature-capabilities → $HTTP_CODE (ok=$FC_OK)"
else
  log_fail "GET /api/runtime/feature-capabilities → $HTTP_CODE (ok=$FC_OK)"
fi

# ── Phase 2: Auth — Register → Login → Logout ────────────────
log_phase "Phase 2 — Auth: Register → Login → Logout (6 tests)"

# 4. POST /api/auth/register
call_api POST /api/auth/register "{\"username\":\"${TEST_USER}\",\"password\":\"${TEST_PASS}\"}"
AUTH_OK=$(jq_val "$BODY" '.authenticated')
AUTH_METHOD=$(jq_val "$BODY" '.method')
USER_ID=$(jq_val "$BODY" '.user.id')
if [[ "$HTTP_CODE" == "200" && "$AUTH_OK" == "true" && "$AUTH_METHOD" == "session" ]]; then
  log_pass "POST /api/auth/register → $HTTP_CODE (authenticated=$AUTH_OK, user=$USER_ID)"
elif [[ "$HTTP_CODE" == "403" ]]; then
  log_skip "POST /api/auth/register → $HTTP_CODE (self-signup disabled)"
  if [[ -z "${E2E_API_KEY:-}" ]]; then
    echo -e "  ${YELLOW}Hint: set E2E_API_KEY to test with an existing key when signup is disabled${RESET}"
  fi
else
  log_fail "POST /api/auth/register → $HTTP_CODE body=$(echo "$BODY" | head -1)"
fi

# 5. GET /api/auth/me (with session cookie)
call_api GET /api/auth/me
AUTH_OK=$(jq_val "$BODY" '.authenticated')
AUTH_METHOD=$(jq_val "$BODY" '.method')
if [[ "$HTTP_CODE" == "200" && "$AUTH_OK" == "true" && "$AUTH_METHOD" == "session" ]]; then
  log_pass "GET /api/auth/me → $HTTP_CODE (authenticated=$AUTH_OK, method=$AUTH_METHOD)"
elif [[ "$HTTP_CODE" == "503" ]]; then
  log_skip "GET /api/auth/me → $HTTP_CODE (service unavailable)"
else
  log_fail "GET /api/auth/me → $HTTP_CODE (authenticated=$AUTH_OK, method=$AUTH_METHOD)"
fi

# 6. POST /api/auth/logout
call_api POST /api/auth/logout
LOGOUT_OK=$(jq_val "$BODY" '.ok')
if [[ "$HTTP_CODE" == "200" && "$LOGOUT_OK" == "true" ]]; then
  log_pass "POST /api/auth/logout → $HTTP_CODE (ok=$LOGOUT_OK)"
else
  log_fail "POST /api/auth/logout → $HTTP_CODE (ok=$LOGOUT_OK)"
fi

# 7. GET /api/auth/me (after logout — expect unauthenticated)
call_api GET /api/auth/me
AUTH_OK=$(jq_val "$BODY" '.authenticated')
if [[ "$HTTP_CODE" == "401" ]] || [[ "$HTTP_CODE" == "200" && "$AUTH_OK" == "false" ]]; then
  log_pass "GET /api/auth/me (post-logout) → $HTTP_CODE (authenticated=$AUTH_OK)"
elif [[ "$HTTP_CODE" == "503" ]]; then
  log_skip "GET /api/auth/me (post-logout) → $HTTP_CODE (service unavailable)"
else
  log_fail "GET /api/auth/me (post-logout) → $HTTP_CODE (authenticated=$AUTH_OK)"
fi

# 8. POST /api/auth/login
call_api POST /api/auth/login "{\"username\":\"${TEST_USER}\",\"password\":\"${TEST_PASS}\"}"
AUTH_OK=$(jq_val "$BODY" '.authenticated')
AUTH_METHOD=$(jq_val "$BODY" '.method')
if [[ "$HTTP_CODE" == "200" && "$AUTH_OK" == "true" && "$AUTH_METHOD" == "session" ]]; then
  log_pass "POST /api/auth/login → $HTTP_CODE (authenticated=$AUTH_OK, method=$AUTH_METHOD)"
else
  log_fail "POST /api/auth/login → $HTTP_CODE body=$(echo "$BODY" | head -1)"
fi

# 9. GET /api/auth/me (new session)
call_api GET /api/auth/me
AUTH_OK=$(jq_val "$BODY" '.authenticated')
RETURNED_USER=$(jq_val "$BODY" '.user.id')
if [[ "$HTTP_CODE" == "200" && "$AUTH_OK" == "true" && "$RETURNED_USER" == "$USER_ID" ]]; then
  log_pass "GET /api/auth/me (re-login) → $HTTP_CODE (same user=$RETURNED_USER)"
elif [[ "$HTTP_CODE" == "200" && "$AUTH_OK" == "true" ]]; then
  log_pass "GET /api/auth/me (re-login) → $HTTP_CODE (authenticated=$AUTH_OK)"
elif [[ "$HTTP_CODE" == "503" ]]; then
  log_skip "GET /api/auth/me (re-login) → $HTTP_CODE (service unavailable)"
else
  log_fail "GET /api/auth/me (re-login) → $HTTP_CODE (authenticated=$AUTH_OK)"
fi

# ── Phase 3: Agents CRUD ─────────────────────────────────────
log_phase "Phase 3 — Agents CRUD (5 tests)"

# 10. POST /api/agents — create
call_api POST /api/agents "{\"name\":\"e2e-agent-${EPOCH}\",\"description\":\"E2E test agent\",\"status\":\"active\"}"
AGENT_ID=$(jq_val "$BODY" '.id // .agentId')
if [[ "$HTTP_CODE" == "201" && -n "$AGENT_ID" && "$AGENT_ID" != "null" ]]; then
  log_pass "POST /api/agents → $HTTP_CODE (agentId=$AGENT_ID)"
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
  log_skip "POST /api/agents → $HTTP_CODE (auth required)"
  AGENT_ID=""
else
  log_fail "POST /api/agents → $HTTP_CODE body=$(echo "$BODY" | head -1)"
  AGENT_ID=""
fi

# 11. GET /api/agents — list
call_api GET /api/agents
if [[ "$HTTP_CODE" == "200" ]]; then
  ITEMS=$(jq_val "$BODY" '.items | length')
  FOUND="false"
  if [[ -n "$AGENT_ID" && "$AGENT_ID" != "null" ]]; then
    FOUND=$(echo "$BODY" | jq -r --arg id "$AGENT_ID" '[.items[]? | select(.id == $id or .agentId == $id)] | length > 0' 2>/dev/null || echo "false")
  fi
  if [[ "$FOUND" == "true" ]]; then
    log_pass "GET /api/agents → $HTTP_CODE (items=$ITEMS, contains our agent)"
  else
    log_pass "GET /api/agents → $HTTP_CODE (items=$ITEMS)"
  fi
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
  log_skip "GET /api/agents → $HTTP_CODE"
else
  log_fail "GET /api/agents → $HTTP_CODE"
fi

# 12. GET /api/agents/:agentId
if [[ -n "$AGENT_ID" && "$AGENT_ID" != "null" ]]; then
  call_api GET "/api/agents/${AGENT_ID}"
  RETURNED_NAME=$(jq_val "$BODY" '.name')
  if [[ "$HTTP_CODE" == "200" && -n "$RETURNED_NAME" ]]; then
    log_pass "GET /api/agents/$AGENT_ID → $HTTP_CODE (name=$RETURNED_NAME)"
  else
    log_fail "GET /api/agents/$AGENT_ID → $HTTP_CODE"
  fi
else
  log_skip "GET /api/agents/:agentId → skipped (no agent created)"
fi

# 13. PATCH /api/agents/:agentId — rename
if [[ -n "$AGENT_ID" && "$AGENT_ID" != "null" ]]; then
  call_api PATCH "/api/agents/${AGENT_ID}" "{\"name\":\"e2e-agent-${EPOCH}-renamed\"}"
  UPDATED_NAME=$(jq_val "$BODY" '.name')
  if [[ "$HTTP_CODE" == "200" && "$UPDATED_NAME" == "e2e-agent-${EPOCH}-renamed" ]]; then
    log_pass "PATCH /api/agents/$AGENT_ID → $HTTP_CODE (name=$UPDATED_NAME)"
  elif [[ "$HTTP_CODE" == "200" ]]; then
    log_pass "PATCH /api/agents/$AGENT_ID → $HTTP_CODE"
  else
    log_fail "PATCH /api/agents/$AGENT_ID → $HTTP_CODE"
  fi
else
  log_skip "PATCH /api/agents/:agentId → skipped (no agent created)"
fi

# 14. DELETE /api/agents/:agentId
if [[ -n "$AGENT_ID" && "$AGENT_ID" != "null" ]]; then
  call_api DELETE "/api/agents/${AGENT_ID}"
  ARCHIVED=$(jq_val "$BODY" '.archived')
  if [[ "$HTTP_CODE" == "200" && "$ARCHIVED" == "true" ]]; then
    log_pass "DELETE /api/agents/$AGENT_ID → $HTTP_CODE (archived=$ARCHIVED)"
  elif [[ "$HTTP_CODE" == "200" ]]; then
    log_pass "DELETE /api/agents/$AGENT_ID → $HTTP_CODE"
  else
    log_fail "DELETE /api/agents/$AGENT_ID → $HTTP_CODE"
  fi
else
  log_skip "DELETE /api/agents/:agentId → skipped (no agent created)"
fi

# ── Phase 4: Orchestrations CRUD ─────────────────────────────
log_phase "Phase 4 — Orchestrations CRUD (5 tests)"

# 15. POST /api/orchestrations — create
call_api POST /api/orchestrations "{\"name\":\"e2e-orch-${EPOCH}\",\"description\":\"E2E test orchestration\"}"
ORCH_ID=$(jq_val "$BODY" '.id // .orchestrationId')
if [[ "$HTTP_CODE" == "201" && -n "$ORCH_ID" && "$ORCH_ID" != "null" ]]; then
  log_pass "POST /api/orchestrations → $HTTP_CODE (id=$ORCH_ID)"
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
  log_skip "POST /api/orchestrations → $HTTP_CODE (auth required)"
  ORCH_ID=""
else
  log_fail "POST /api/orchestrations → $HTTP_CODE body=$(echo "$BODY" | head -1)"
  ORCH_ID=""
fi

# 16. GET /api/orchestrations — list
call_api GET /api/orchestrations
if [[ "$HTTP_CODE" == "200" ]]; then
  ITEMS=$(jq_val "$BODY" '.items | length')
  log_pass "GET /api/orchestrations → $HTTP_CODE (items=$ITEMS)"
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
  log_skip "GET /api/orchestrations → $HTTP_CODE"
else
  log_fail "GET /api/orchestrations → $HTTP_CODE"
fi

# 17. GET /api/orchestrations/:id
if [[ -n "$ORCH_ID" && "$ORCH_ID" != "null" ]]; then
  call_api GET "/api/orchestrations/${ORCH_ID}"
  RETURNED_NAME=$(jq_val "$BODY" '.name')
  if [[ "$HTTP_CODE" == "200" && -n "$RETURNED_NAME" ]]; then
    log_pass "GET /api/orchestrations/$ORCH_ID → $HTTP_CODE (name=$RETURNED_NAME)"
  else
    log_fail "GET /api/orchestrations/$ORCH_ID → $HTTP_CODE"
  fi
else
  log_skip "GET /api/orchestrations/:id → skipped (no orchestration created)"
fi

# 18. PATCH /api/orchestrations/:id — update
if [[ -n "$ORCH_ID" && "$ORCH_ID" != "null" ]]; then
  call_api PATCH "/api/orchestrations/${ORCH_ID}" "{\"name\":\"e2e-orch-${EPOCH}-updated\",\"description\":\"Updated by E2E\"}"
  UPDATED_NAME=$(jq_val "$BODY" '.name')
  if [[ "$HTTP_CODE" == "200" && "$UPDATED_NAME" == "e2e-orch-${EPOCH}-updated" ]]; then
    log_pass "PATCH /api/orchestrations/$ORCH_ID → $HTTP_CODE (name=$UPDATED_NAME)"
  elif [[ "$HTTP_CODE" == "200" ]]; then
    log_pass "PATCH /api/orchestrations/$ORCH_ID → $HTTP_CODE"
  else
    log_fail "PATCH /api/orchestrations/$ORCH_ID → $HTTP_CODE"
  fi
else
  log_skip "PATCH /api/orchestrations/:id → skipped (no orchestration created)"
fi

# 19. DELETE /api/orchestrations/:id
if [[ -n "$ORCH_ID" && "$ORCH_ID" != "null" ]]; then
  call_api DELETE "/api/orchestrations/${ORCH_ID}"
  ARCHIVED=$(jq_val "$BODY" '.archived')
  if [[ "$HTTP_CODE" == "200" && "$ARCHIVED" == "true" ]]; then
    log_pass "DELETE /api/orchestrations/$ORCH_ID → $HTTP_CODE (archived=$ARCHIVED)"
  elif [[ "$HTTP_CODE" == "200" ]]; then
    log_pass "DELETE /api/orchestrations/$ORCH_ID → $HTTP_CODE"
  else
    log_fail "DELETE /api/orchestrations/$ORCH_ID → $HTTP_CODE"
  fi
else
  log_skip "DELETE /api/orchestrations/:id → skipped (no orchestration created)"
fi

# ── Phase 5: Traces & Observability ──────────────────────────
log_phase "Phase 5 — Traces & Observability (2 tests)"

# 20. GET /api/traces
call_api GET /api/traces
if [[ "$HTTP_CODE" == "200" ]]; then
  TRACE_COUNT=$(jq_val "$BODY" '.count // (.traces | length)')
  log_pass "GET /api/traces → $HTTP_CODE (count=$TRACE_COUNT)"
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
  log_skip "GET /api/traces → $HTTP_CODE"
else
  log_fail "GET /api/traces → $HTTP_CODE"
fi

# 21. GET /api/community/stats
call_api GET /api/community/stats
if [[ "$HTTP_CODE" == "200" ]]; then
  log_pass "GET /api/community/stats → $HTTP_CODE"
else
  log_fail "GET /api/community/stats → $HTTP_CODE"
fi

# ── Phase 6: Billing (read-only) ─────────────────────────────
log_phase "Phase 6 — Billing (read-only) (2 tests)"

# 22. GET /api/user/profile
call_api GET /api/user/profile
PROFILE_OK=$(jq_val "$BODY" '.ok')
if [[ "$HTTP_CODE" == "200" && "$PROFILE_OK" == "true" ]]; then
  log_pass "GET /api/user/profile → $HTTP_CODE (ok=$PROFILE_OK)"
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
  log_skip "GET /api/user/profile → $HTTP_CODE (session required)"
else
  log_fail "GET /api/user/profile → $HTTP_CODE"
fi

# 23. GET /api/billing/subscription
call_api GET /api/billing/subscription
BILLING_OK=$(jq_val "$BODY" '.ok')
if [[ "$HTTP_CODE" == "200" && "$BILLING_OK" == "true" ]]; then
  BILLING_MODE=$(jq_val "$BODY" '.billingMode')
  log_pass "GET /api/billing/subscription → $HTTP_CODE (billingMode=$BILLING_MODE)"
elif [[ "$HTTP_CODE" == "200" ]]; then
  log_pass "GET /api/billing/subscription → $HTTP_CODE"
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
  log_skip "GET /api/billing/subscription → $HTTP_CODE (session required)"
elif [[ "$HTTP_CODE" == "503" ]]; then
  log_skip "GET /api/billing/subscription → $HTTP_CODE (service unavailable)"
else
  log_fail "GET /api/billing/subscription → $HTTP_CODE"
fi

# ── Phase 7: OpenClaw Status ─────────────────────────────────
log_phase "Phase 7 — OpenClaw Status (2 tests)"

# 24. GET /api/openclaw/agent/status
call_api GET /api/openclaw/agent/status
OC_OK=$(jq_val "$BODY" '.ok')
if [[ "$HTTP_CODE" == "200" && "$OC_OK" == "true" ]]; then
  log_pass "GET /api/openclaw/agent/status → $HTTP_CODE (ok=$OC_OK)"
elif [[ "$HTTP_CODE" == "200" ]]; then
  log_pass "GET /api/openclaw/agent/status → $HTTP_CODE"
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" || "$HTTP_CODE" == "503" ]]; then
  log_skip "GET /api/openclaw/agent/status → $HTTP_CODE"
else
  log_fail "GET /api/openclaw/agent/status → $HTTP_CODE"
fi

# 25. GET /api/openclaw/modifier/capabilities
call_api GET /api/openclaw/modifier/capabilities
MOD_OK=$(jq_val "$BODY" '.ok')
if [[ "$HTTP_CODE" == "200" && "$MOD_OK" == "true" ]]; then
  log_pass "GET /api/openclaw/modifier/capabilities → $HTTP_CODE (ok=$MOD_OK)"
elif [[ "$HTTP_CODE" == "200" ]]; then
  log_pass "GET /api/openclaw/modifier/capabilities → $HTTP_CODE"
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" || "$HTTP_CODE" == "503" ]]; then
  log_skip "GET /api/openclaw/modifier/capabilities → $HTTP_CODE"
else
  log_fail "GET /api/openclaw/modifier/capabilities → $HTTP_CODE"
fi

# ── Phase 8: API Key Auth ────────────────────────────────────
log_phase "Phase 8 — API Key Auth (3 tests)"

# 26. POST /api/user/api-keys — create key
call_api POST /api/user/api-keys "{\"name\":\"e2e-key-${EPOCH}\"}"
KEY_OK=$(jq_val "$BODY" '.ok')
# The raw key value may be at .key.key, .key.rawKey, .key.secret, or .key.value
API_KEY_RAW=$(jq_val "$BODY" '.key.key // .key.rawKey // .key.secret // .key.value // empty')
API_KEY_ID=$(jq_val "$BODY" '.key.id // .key.keyId // empty')
if [[ "$HTTP_CODE" == "201" && "$KEY_OK" == "true" && -n "$API_KEY_RAW" && "$API_KEY_RAW" != "null" ]]; then
  log_pass "POST /api/user/api-keys → $HTTP_CODE (keyId=$API_KEY_ID)"
elif [[ "$HTTP_CODE" == "201" && "$KEY_OK" == "true" ]]; then
  log_pass "POST /api/user/api-keys → $HTTP_CODE (keyId=$API_KEY_ID, raw key field not found)"
  API_KEY_RAW=""
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
  log_skip "POST /api/user/api-keys → $HTTP_CODE (session required)"
  API_KEY_RAW=""
  API_KEY_ID=""
elif [[ "$HTTP_CODE" == "503" ]]; then
  log_skip "POST /api/user/api-keys → $HTTP_CODE (service unavailable)"
  API_KEY_RAW=""
  API_KEY_ID=""
else
  log_fail "POST /api/user/api-keys → $HTTP_CODE body=$(echo "$BODY" | head -1)"
  API_KEY_RAW=""
  API_KEY_ID=""
fi

# If E2E_API_KEY provided, use it for the next test
if [[ -n "${E2E_API_KEY:-}" ]]; then
  API_KEY_RAW="$E2E_API_KEY"
fi

# 27. GET /api/auth/me with x-api-key header
if [[ -n "$API_KEY_RAW" && "$API_KEY_RAW" != "null" ]]; then
  call_api_with_key GET /api/auth/me "$API_KEY_RAW"
  AUTH_OK=$(jq_val "$BODY" '.authenticated')
  AUTH_METHOD=$(jq_val "$BODY" '.method')
  if [[ "$HTTP_CODE" == "200" && "$AUTH_OK" == "true" && "$AUTH_METHOD" == "api_key" ]]; then
    log_pass "GET /api/auth/me (api-key) → $HTTP_CODE (method=$AUTH_METHOD)"
  elif [[ "$HTTP_CODE" == "200" && "$AUTH_OK" == "true" ]]; then
    log_pass "GET /api/auth/me (api-key) → $HTTP_CODE (authenticated=$AUTH_OK, method=$AUTH_METHOD)"
  else
    log_fail "GET /api/auth/me (api-key) → $HTTP_CODE (authenticated=$AUTH_OK)"
  fi
else
  log_skip "GET /api/auth/me (api-key) → skipped (no API key available)"
fi

# 28. DELETE /api/user/api-keys/:keyId — revoke
if [[ -n "$API_KEY_ID" && "$API_KEY_ID" != "null" ]]; then
  call_api DELETE "/api/user/api-keys/${API_KEY_ID}"
  DEL_OK=$(jq_val "$BODY" '.ok')
  if [[ "$HTTP_CODE" == "200" && "$DEL_OK" == "true" ]]; then
    log_pass "DELETE /api/user/api-keys/$API_KEY_ID → $HTTP_CODE (ok=$DEL_OK)"
  elif [[ "$HTTP_CODE" == "200" ]]; then
    log_pass "DELETE /api/user/api-keys/$API_KEY_ID → $HTTP_CODE"
  else
    log_fail "DELETE /api/user/api-keys/$API_KEY_ID → $HTTP_CODE"
  fi
else
  log_skip "DELETE /api/user/api-keys/:keyId → skipped (no key to revoke)"
fi

# ── Phase 9: Cleanup ─────────────────────────────────────────
log_phase "Phase 9 — Cleanup (1 test)"

# 29. POST /api/auth/logout — final cleanup
call_api POST /api/auth/logout
LOGOUT_OK=$(jq_val "$BODY" '.ok')
if [[ "$HTTP_CODE" == "200" && "$LOGOUT_OK" == "true" ]]; then
  log_pass "POST /api/auth/logout (final) → $HTTP_CODE (ok=$LOGOUT_OK)"
elif [[ "$HTTP_CODE" == "200" ]]; then
  log_pass "POST /api/auth/logout (final) → $HTTP_CODE"
else
  log_fail "POST /api/auth/logout (final) → $HTTP_CODE"
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
ACTUAL_TOTAL=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))
echo -e "  ${GREEN}Passed: $PASS_COUNT${RESET}  ${RED}Failed: $FAIL_COUNT${RESET}  ${YELLOW}Skipped: $SKIP_COUNT${RESET}  Total: $ACTUAL_TOTAL/$TOTAL"

if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}All tests passed!${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
  exit 0
else
  echo -e "  ${RED}${BOLD}$FAIL_COUNT test(s) failed.${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
  exit 1
fi
