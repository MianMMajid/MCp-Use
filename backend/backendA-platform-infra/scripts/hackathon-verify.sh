#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${MAPLE_BASE_URL:-https://localhost:3000}"
API_KEY="${MAPLE_API_KEY:-local-demo-key}"
SESSION_ID="${MAPLE_VERIFY_SESSION_ID:-hackathon-gateway-smoke}"
INSECURE_TLS="${MAPLE_VERIFY_INSECURE_TLS:-1}"

auth=(-H "x-api-key: ${API_KEY}")
curl_args=(-sS)
if [ "${INSECURE_TLS}" = "1" ]; then
  curl_args+=(-k)
fi

echo "Checking runtime status..."
curl "${curl_args[@]}" "${BASE_URL}/api/runtime/status" "${auth[@]}" | jq '{
  ok,
  routeMode:.status.routeMode,
  routeSummary:.status.routeSummary,
  routeLock:.status.routeLock,
  executionOrder:.status.executionOrder,
  activeDownstreamIds:.status.activeDownstreamIds
}'

echo
echo "Checking downstream tools..."
curl "${curl_args[@]}" "${BASE_URL}/api/downstream/tools?appId=toolhub&refresh=true" "${auth[@]}" | jq '{
  appId,
  toolCount,
  tools:(.tools|map(.name))
}'

dispatch() {
  local tool_name="$1"
  local args_json="$2"
  local body
  body="$(jq -nc \
    --arg toolName "${tool_name}" \
    --arg sessionId "${SESSION_ID}" \
    --argjson args "${args_json}" \
    '{toolName:$toolName,sessionId:$sessionId,arguments:$args}')"

  curl "${curl_args[@]}" -X POST "${BASE_URL}/api/downstream/dispatch" \
    -H "content-type: application/json" \
    "${auth[@]}" \
    --data "${body}" \
    | jq '{
      ok,
      toolName,
      blocked,
      appId,
      traceId,
      stepIndex,
      overallRiskScore,
      severity,
      resultPreview
    }'
}

echo
echo "Dispatch smoke tests..."
echo "- web_search"
dispatch "web_search" '{"query":"Winter Olympics figure skating winners 2002 2006","maxResults":3}'
echo "- web_fetch"
dispatch "web_fetch" '{"url":"https://en.wikipedia.org/wiki/Figure_skating_at_the_2002_Winter_Olympics","maxChars":1200}'
echo "- wikipedia_summary"
dispatch "wikipedia_summary" '{"title":"Figure skating at the 2002 Winter Olympics","lang":"en"}'
echo "- github_repo_info"
dispatch "github_repo_info" '{"owner":"openai","repo":"openai-python"}'
echo "- weather_forecast"
dispatch "weather_forecast" '{"location":"San Francisco","days":2,"unit":"f"}'
echo "- hn_search"
dispatch "hn_search" '{"query":"open source ai safety","tags":"story","maxResults":3}'
echo "- arxiv_search"
dispatch "arxiv_search" '{"query":"agent tool use safety","maxResults":2,"sortBy":"submittedDate"}'
echo "- openlibrary_search"
dispatch "openlibrary_search" '{"query":"distributed systems","maxResults":3}'

if [ -n "${SLACK_WEBHOOK_URL:-}" ] || [ -n "${SLACK_BOT_TOKEN:-}" ]; then
  echo "- slack_post_message"
  if [ -n "${SLACK_CHANNEL:-}" ]; then
    slack_args="$(jq -nc --arg text "Maple hackathon verify ping" --arg channel "${SLACK_CHANNEL}" '{text:$text,channel:$channel}')"
    dispatch "slack_post_message" "${slack_args}"
  else
    dispatch "slack_post_message" '{"text":"Maple hackathon verify ping"}'
  fi
else
  echo "- slack_post_message (skipped: set SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN)"
fi
