Got it. Here’s the **full, low-level component architecture** with **explicit interactions**, **ports/protocols**, **trust boundaries**, and **Kubernetes/Northflank layout**. I’m going to give you:

1. **Master component graph (who talks to who)**
2. **Namespace + network-policy view (what is physically allowed)**
3. **End-to-end sequences (chat, tool-call, web fetch, file download, HITL approval)**
4. **Data-plane vs control-plane and what gets logged where**

You can hand this directly to engineers and they can implement from this spec.

---

## 1) Master Architecture: Every Component + Interaction

```text
TRUST ZONES
  [Z0] Endpoint (managed, but untrusted)
  [Z1] Edge / Gateway (trusted entry)
  [Z2] Semantic Firewall Plane (trusted)
  [Z3] Model Plane (semi-trusted external)
  [Z4] Tool Execution Plane (high-risk)
  [Z5] Cyber Firewall Plane (trusted security service)
  [Z6] Audit/Observability Plane (trusted)

=====================================================================================================
[Z0] DESKTOP (OpenClaw Enterprise Client .exe/.dmg)
=====================================================================================================

  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │ openclaw-desktop                                                                            │
  │                                                                                              │
  │  ┌───────────────┐   ┌───────────────────────┐   ┌───────────────────────┐                  │
  │  │ UI (React/etc)│<->│ Local Agent Shell      │<->│ Transport/Auth Module  │                  │
  │  │ - chat         │   │ - conversation state  │   │ - OIDC login           │                  │
  │  │ - approvals UI │   │ - renders tool intents│   │ - mTLS client cert     │                  │
  │  │ - audit view   │   │ - NO tools executed   │   │ - device attestation   │                  │
  │  └───────────────┘   └───────────────────────┘   └───────────────────────┘                  │
  │            │                        │                         │                              │
  │            │                        │                         │                              │
  │            ▼                        ▼                         ▼                              │
  │     ┌────────────────────────────────────────────────────────────────────────────┐           │
  │     │ Endpoint Security Envelope                                                 │           │
  │     │ - Keychain/DPAPI store (refresh token, device key)                         │           │
  │     │ - Signed updates, integrity checks                                         │           │
  │     │ - Safe renderer (markdown only, no raw HTML)                               │           │
  │     │ - Link wrapper (all links go through safe-redirect)                        │           │
  │     └────────────────────────────────────────────────────────────────────────────┘           │
  └──────────────────────────────────────────────────────────────────────────────────────────────┘

  Protocols outbound:
    - HTTPS (mTLS) to maple-edge only
    - No direct calls to internal services

=====================================================================================================
[Z1] EDGE / GATEWAY (Northflank public entrypoint)
Namespace: maple-gateway
=====================================================================================================

  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │ maple-edge (Envoy/NGINX)  :443 public                                                       │
  │  - mTLS verify (device cert)                                                                │
  │  - OIDC verify (JWT)                                                                        │
  │  - Rate limit (per tenant/user/device)                                                      │
  │  - Routes to internal services (cluster DNS)                                                 │
  └───────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                  │ internal HTTPS
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │ gateway-api (BFF) :8443                                                                      │
  │  - session mgmt, websocket streaming                                                         │
  │  - issues short-lived session token                                                          │
  │  - forwards requests to context-wall                                                         │
  └───────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                  │ gRPC/HTTPS
                                  ▼

=====================================================================================================
[Z2] SEMANTIC FIREWALL PLANE (Context Wall + Policy)
Namespace: maple-context
=====================================================================================================

  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │ context-wall :9000 (gRPC)                                                                     │
  │  INPUT: {tenant,user,device,conversation,proposed_action}                                     │
  │  OUTPUT: {sanitized_prompt, allowed_tools, tool_scopes, decision, risk_score, HITL_required}  │
  │                                                                                               │
  │  Internals:                                                                                   │
  │   ┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐   │
  │   │ policy-engine (OPA)       │  │ dlp-engine               │  │ prompt-injection guard   │   │
  │   │ - allow/deny              │  │ - PII/PHI/secrets detect  │  │ - instruction hierarchy  │   │
  │   │ - tool param constraints  │  │ - redact/block            │  │ - jailbreak heuristics   │   │
  │   └──────────────┬───────────┘  └──────────────┬───────────┘  └──────────────┬───────────┘   │
  │                  │                              │                              │               │
  │                  └──────────────┬───────────────┴───────────────┬──────────────┘               │
  │                                 ▼                               ▼                              │
  │                        ┌─────────────────┐              ┌──────────────────┐                   │
  │                        │ risk-scoring     │              │ HITL router       │                   │
  │                        │ - thresholds     │              │ - approval workflow│                   │
  │                        └───────┬─────────┘              └───────┬──────────┘                   │
  └───────────────────────────────┼──────────────────────────────────┼──────────────────────────────┘
                                  │                                  │
                                  │                                  │
                     allowed prompt│                                  │approval request
                                  ▼                                  ▼

=====================================================================================================
[Z3] MODEL PLANE (Model Router -> OpenAI)
Namespace: maple-model
=====================================================================================================

  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │ model-router :9100 (gRPC)                                                                     │
  │  - wraps system prompt ("secure mode")                                                        │
  │  - enforces allowed_tools schema list                                                         │
  │  - strips disallowed tool schemas                                                             │
  │  - calls external model endpoints                                                             │
  │                                                                                               │
  │  Outbound: HTTPS :443 to model provider(s) only                                                │
  └───────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                  │ tool calls + assistant text
                                  ▼

=====================================================================================================
[Z4] TOOL EXECUTION PLANE (MCP Proxy + Sandboxed Runners)
Namespace: maple-tools
=====================================================================================================

  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │ mcp-proxy :9200 (gRPC/HTTP)                                                                    │
  │  - validates tool call again (defense-in-depth)                                                │
  │  - maps tool_call -> tool-runner job                                                           │
  │  - injects scoped secrets via secrets-broker                                                   │
  │  - forces ALL outbound HTTP via cyber-proxy (HTTP_PROXY)                                       │
  │                                                                                               │
  │   ┌───────────────────────────┐        ┌──────────────────────────────────────────────────┐   │
  │   │ secrets-broker :9300       │        │ tool-runner (K8s Jobs or Deployments)            │   │
  │   │ - per-tool serviceaccount  │        │ - gmail-runner, slack-runner, browser-runner... │   │
  │   │ - short-lived creds        │        │ - non-root, RO filesystem, no caps              │   │
  │   │ - never exposed to model   │        │ - NO direct internet egress                      │   │
  │   └───────────────┬───────────┘        └───────────────┬──────────────────────────────────┘   │
  │                   │                                    │ (HTTP via proxy only)                │
  └───────────────────┼────────────────────────────────────┼──────────────────────────────────────┘
                      │                                    │
                      │                                    ▼

=====================================================================================================
[Z5] CYBER FIREWALL PLANE (Network + Content Security Proxy)
Namespace: maple-cyber
=====================================================================================================

  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │ cyber-proxy :8080 (HTTP forward proxy)                                                         │
  │  - outbound allowlists per tool                                                                │
  │  - blocks private IPs, metadata IPs, RFC1918, link-local                                       │
  │  - URL reputation checks                                                                       │
  │  - response content-type validation                                                            │
  │  - HTML sanitizer (strip scripts/iframes)                                                      │
  │  - download quarantine + malware scan                                                          │
  │  - SSRF guard (DNS pinning, IP re-check after resolve)                                         │
  └───────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                  │ HTTPS :443 to Internet
                                  ▼

=====================================================================================================
[Z6] OBSERVABILITY + AUDIT + ADMIN (Immutable evidence)
Namespace: maple-observability, maple-admin
=====================================================================================================

  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │ otel-collector :4317/4318                                                                       │
  │ audit-writer :9400                                                                              │
  │ trace-store (DB)                                                                                │
  │ policy-events (append-only log)                                                                  │
  │ admin-console :9443 (private, SSO)                                                               │
  └──────────────────────────────────────────────────────────────────────────────────────────────┘

  EVERY component emits:
    - structured logs -> otel-collector
    - audit events -> audit-writer (append-only)
```

---

## 2) “Who is allowed to talk to whom?” (K8s Network Policy View)

This is the **actual allow graph** you implement with NetworkPolicies.

```text
ALLOWED CONNECTIONS ONLY (everything else denied)

[Endpoint]
  openclaw-desktop --> maple-edge:443

[maple-gateway]
  maple-edge --> gateway-api:8443
  gateway-api --> context-wall:9000
  gateway-api --> audit-writer:9400
  gateway-api --> otel-collector:4317/4318

[maple-context]
  context-wall --> model-router:9100
  context-wall --> mcp-proxy:9200
  context-wall --> audit-writer:9400
  context-wall --> otel-collector:4317/4318
  context-wall --> admin-console (optional, for policy mgmt) :9443 (private only)

[maple-model]
  model-router --> external LLM provider(s):443 (ONLY)
  model-router --> audit-writer:9400
  model-router --> otel-collector:4317/4318

[maple-tools]
  mcp-proxy --> secrets-broker:9300
  mcp-proxy --> tool-runner services/jobs
  tool-runner --> cyber-proxy:8080 (ONLY)
  tool-runner --> audit-writer:9400
  tool-runner --> otel-collector:4317/4318

[maple-cyber]
  cyber-proxy --> Internet:443/80 (policy gated)
  cyber-proxy --> audit-writer:9400
  cyber-proxy --> otel-collector:4317/4318

[maple-admin]
  admin-console --> policy store / audit store (private)
```

**Key enforcement rule:** tool pods have **NO egress to Internet**, only to `cyber-proxy:8080`.

---

## 3) Core Sequences (Exact Interaction Flows)

### 3.1 Chat message → assistant response (no tools)

```text
1) Desktop -> maple-edge:443  (mTLS + OIDC JWT)  POST /chat
2) maple-edge -> gateway-api
3) gateway-api -> context-wall   Evaluate(prompt, tenant, user, device)
4) context-wall -> model-router  Generate(sanitized_prompt, allowed_tool_schemas=none)
5) model-router -> LLM provider  HTTPS:443
6) model-router -> context-wall  returns assistant_text
7) context-wall -> audit-writer  append event chain
8) gateway-api -> Desktop        stream tokens over websocket/SSE
```

### 3.2 Chat message → tool call → tool result → final answer

```text
1) Desktop -> gateway-api (via maple-edge)  POST /chat
2) gateway-api -> context-wall   Evaluate(prompt)
3) context-wall -> model-router  Generate(sanitized_prompt + tool schemas)
4) model-router -> LLM provider
5) LLM provider -> model-router  returns tool_call(name, args)
6) model-router -> context-wall  tool_call proposal
7) context-wall -> policy-engine Validate tool_call + args + scopes
    - if HITL_required -> go to 3.4
8) context-wall -> mcp-proxy     ExecuteTool(tool_call_id, tool, args, scopes)
9) mcp-proxy -> secrets-broker   Mint scoped credentials (short-lived)
10) mcp-proxy -> tool-runner     Run(job) with injected creds + HTTP_PROXY=cyber-proxy:8080
11) tool-runner -> cyber-proxy   outbound request (ALL web traffic)
12) cyber-proxy -> Internet      allowlist/reputation/SSRF/malware gates
13) cyber-proxy -> tool-runner   sanitized response payload
14) tool-runner -> mcp-proxy     tool_result (structured JSON)
15) mcp-proxy -> context-wall    tool_result
16) context-wall -> model-router Finalize(answer with tool_result)
17) model-router -> LLM provider
18) gateway-api -> Desktop       final streamed response
19) ALL hops -> audit-writer + otel
```

### 3.3 Web content fetch / browser tool (XSS/malicious handling)

```text
- tool-runner requests URL via cyber-proxy
- cyber-proxy:
   (a) resolves DNS
   (b) blocks private ranges + metadata endpoints
   (c) reputation checks
   (d) fetches content
   (e) validates content-type
   (f) sanitizes HTML: strips scripts/iframes/event-handlers
   (g) returns "safe_html" or "text_extract"
- desktop UI renders markdown only; links are safe-redirected
```

### 3.4 HITL approval (Human-in-the-loop)

```text
1) context-wall decides HITL_required=true with reason + diff
2) context-wall -> gateway-api  "approval_request" event
3) Desktop shows modal:
     - tool name
     - arguments
     - risk reason
     - allow once / deny / allow always (scope)
4) Desktop -> gateway-api ApprovalDecision(signed by user session)
5) gateway-api -> context-wall  records approval decision
6) context-wall -> mcp-proxy    continue execution
7) audit-writer stores:
     - requested action
     - decision
     - approver identity
     - timestamp
```

---

## 4) Internal Contracts: What Each Component Expects

### 4.1 context-wall ↔ model-router contract

**Request**

```json
{
  "tenant_id": "...",
  "user_id": "...",
  "session_id": "...",
  "sanitized_prompt": "...",
  "allowed_tool_schemas": [ ... ],
  "policy_tags": ["no_pii", "no_external_email", ...]
}
```

**Response**

```json
{
  "assistant_text": "...",
  "tool_call": {
    "name": "browser.fetch",
    "args": { "url": "..." }
  } | null
}
```

### 4.2 context-wall ↔ mcp-proxy contract

**ExecuteTool**

```json
{
  "tool_call_id": "...",
  "tool_name": "...",
  "args": { ... },
  "scopes": {
    "allowed_domains": ["api.slack.com", "graph.microsoft.com"],
    "max_bytes": 500000,
    "allow_file_download": false
  }
}
```

**ToolResult**

```json
{
  "tool_call_id": "...",
  "status": "ok|blocked|error",
  "result": { ... },
  "cyber_report": { "url_reputation": "...", "sanitized": true, "malware": false }
}
```

---

## 5) “More specific” Northflank mapping (what services you create)

Create **one Northflank service per box**:

**Public**

* `maple-edge` (ingress / envoy / nginx) — the only exposed service

**Private**

* `gateway-api`
* `context-wall`
* `model-router`
* `mcp-proxy`
* `secrets-broker`
* `cyber-proxy`
* `otel-collector`
* `audit-writer`
* `admin-console`
* `trace-store` (managed DB you attach, or internal DB service if needed)

**Tool runners**: either

* long-running services per tool (`slack-runner`, `gmail-runner`, etc.), or
* a `tool-runner-controller` that spins K8s Jobs per request (better isolation).

For security, I’d do:

* **Job-per-execution** for browser/download tools
* **Service-per-tool** for low-risk API tools with strict egress

---

## 6) One Diagram Specifically for Engineers: Ports + Protocols

```text
PORT MAP (recommended)

maple-edge            :443   (public)      HTTPS + mTLS + OIDC
gateway-api           :8443  (private)     HTTPS/gRPC
context-wall          :9000  (private)     gRPC
model-router          :9100  (private)     gRPC
mcp-proxy             :9200  (private)     gRPC/HTTP
secrets-broker        :9300  (private)     gRPC
cyber-proxy           :8080  (private)     HTTP proxy
otel-collector        :4317/4318 (private) OTLP
audit-writer          :9400  (private)     gRPC/HTTP
admin-console         :9443  (private)     HTTPS
```

---

## 7) What you should implement first (because it forces the right shape)

**Week 1 “spine” (minimum to make everything else correct):**

1. `maple-edge` + `gateway-api` with mTLS + OIDC
2. `context-wall` with a minimal policy engine (allow/deny + tool allowlist)
3. `model-router` (just OpenAI call + tool schema gating)
4. `mcp-proxy` executing **one tool** in a sandbox
5. `cyber-proxy` enforcing “tools must proxy all internet”
6. `audit-writer` logging: policy decisions + tool invocations + approvals

Everything else (DLP sophistication, admin console, more tools) composes cleanly after this.

---

If you want, I can also output a **second ASCII** that is *purely* the K8s resources (Deployments/Services/NetworkPolicies/ServiceAccounts) and an **allowlist matrix per tool** (domains, methods, max bytes, download allowed). That’s usually the missing piece that turns this into a buildable plan.
