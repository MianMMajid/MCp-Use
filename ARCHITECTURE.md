# Maple Platform — Architecture & How It Works

Maple is a **prevention-first, vendor-agnostic, no-code security control plane for AI agent tool execution**. It sits between AI agents and the tools they use, intercepting every action *before* execution to allow, block, or require human approval — with no code changes to agents.

---

## Table of Contents

1. [What Maple Does](#1-what-maple-does)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Service Mesh — The 8 Core Services](#3-service-mesh--the-8-core-services)
4. [Gateway API — The HTTP Entry Point](#4-gateway-api--the-http-entry-point)
5. [Context Wall — The Policy Evaluation Engine](#5-context-wall--the-policy-evaluation-engine)
6. [MCP Proxy — Tool Dispatch](#6-mcp-proxy--tool-dispatch)
7. [Cyber Proxy — SSRF & Malware Scanning](#7-cyber-proxy--ssrf--malware-scanning)
8. [Audit Writer — Immutable Audit Chain](#8-audit-writer--immutable-audit-chain)
9. [Trace System — Execution Observability](#9-trace-system--execution-observability)
10. [OpenClaw — Agent/CLI/Modifier Orchestration](#10-openclaw--agentclimodifier-orchestration)
11. [Orchestration Engine — Execution Graphs & Workflows](#11-orchestration-engine--execution-graphs--workflows)
12. [Authentication System](#12-authentication-system)
13. [Tenant Isolation & Multi-Tenancy](#13-tenant-isolation--multi-tenancy)
14. [Escalation Chains & Break-Glass](#14-escalation-chains--break-glass)
15. [Alert Webhooks](#15-alert-webhooks)
16. [Frontend Surfaces](#16-frontend-surfaces)
17. [Shared Packages (Monorepo Internals)](#17-shared-packages-monorepo-internals)
18. [Data Models & Persistence](#18-data-models--persistence)
19. [Security Patterns](#19-security-patterns)
20. [Deployment](#20-deployment)
21. [Testing & Quality Gates](#21-testing--quality-gates)

---

## 1. What Maple Does

**Core thesis**: As AI agents become autonomous, prevention must be automatic, security policy must be democratized (not locked to engineers), and the control layer must be vendor-agnostic infrastructure — not a feature of a single AI provider.

**In practice, Maple**:

- **Intercepts** every tool call an AI agent makes (file writes, API calls, shell commands, emails, browser actions)
- **Evaluates** each action against configurable firewall rules (policy engine)
- **Decides** in real-time: ALLOW, DENY, or REQUIRE HUMAN APPROVAL
- **Logs** every action immutably to a tamper-evident audit chain
- **Scores** risk using behavioral ML models and anomaly detection
- **Detects** secrets (PII, API keys, SSNs) and redacts before logging
- **Orchestrates** multi-step agent workflows with approval gates
- **Alerts** via webhooks when dangerous actions occur

**Example flow**:
```
Agent wants to run: shell("rm -rf /var/data/*")
  → Maple intercepts the tool call
  → Policy engine evaluates: matches "destructive shell command" rule
  → Decision: PENDING_APPROVAL (requires human-in-the-loop)
  → Notification sent to on-call engineer
  → Engineer reviews in dashboard, approves with justification
  → Tool executes, audit event recorded
  → If engineer rejects → agent receives denial, tries alternative
```

---

## 2. System Architecture Overview

```
                    Clients (OpenAI, Anthropic, Custom Agents)
                                    |
                           [Gateway API]
                         HTTP entry point
                         Auth, routing, orchestration
                                    |
          +---------------------+---+---+---------------------+
          |                     |       |                     |
     [Context Wall]       [MCP Proxy]  |               [Cyber Proxy]
      Policy Engine        Tool Exec   |                SSRF/Malware
    (gRPC :50051)        (gRPC :50052) |              (gRPC :50053)
          |                     |       |                     |
          +---------------------+---+---+---------------------+
                                    |
                           [Audit Writer]
                        PostgreSQL Persistence
                        (gRPC :50054, HTTP :50055)
                                    |
                         +----------+----------+
                         |                     |
                    [Business API]       [Tool Runner]
                   User/Billing/Org      K8s Job Exec
                    (HTTP :3001)        (gRPC :50056)
```

**Data flow for a typical tool call**:

1. Agent sends tool call to **Gateway API** (HTTP)
2. Gateway authenticates (session/API key/OAuth)
3. Gateway creates a trace step and calls **Context Wall** (gRPC)
4. Context Wall evaluates against firewall rules
5. If URL involved → Context Wall calls **Cyber Proxy** for SSRF check
6. If ALLOW → Context Wall calls **MCP Proxy** to execute the tool
7. MCP Proxy calls **Cyber Proxy** for response content scanning
8. MCP Proxy calls downstream MCP server (the actual tool)
9. Every step emits audit events to **Audit Writer** (gRPC)
10. Gateway returns result to agent

---

## 3. Service Mesh — The 8 Core Services

### 3.1 Gateway API

**Role**: HTTP entry point for all clients. Orchestrates auth, routing, trace management, and the OpenClaw agent runtime.

- **Port**: 3000 (HTTP)
- **Depends on**: PostgreSQL, Context Wall, MCP Proxy, Audit Writer
- **Key responsibilities**:
  - Session and API key authentication
  - Google OAuth and GPT OAuth flows
  - Trace lifecycle management (create, ingest steps, complete)
  - Human-in-the-loop approval queue (SSE streaming)
  - OpenClaw agent/CLI/modifier runtimes
  - Orchestration execution engine
  - Frontend asset serving
  - Prometheus metrics export

### 3.2 Context Wall

**Role**: gRPC policy evaluation engine. The "firewall brain" that decides ALLOW/DENY/PENDING for every action.

- **Port**: 50051 (gRPC)
- **Depends on**: PostgreSQL, MCP Proxy, Cyber Proxy, Audit Writer
- **Key responsibilities**:
  - Evaluate trace steps against firewall rules
  - Risk scoring via ML models
  - PII/secret detection and redaction
  - Approval queue management
  - Local model provider routing (OpenAI/Anthropic for policy chat)

### 3.3 MCP Proxy

**Role**: gRPC tool execution service. Routes tool calls to downstream MCP servers with security guards.

- **Port**: 50052 (gRPC)
- **Depends on**: Cyber Proxy, Audit Writer
- **Key responsibilities**:
  - HMAC-signed credential minting (scoped, short-lived)
  - SSRF pre-check via Cyber Proxy
  - Tool execution against downstream MCP servers
  - Response content scanning
  - Fan-out tool chain execution

### 3.4 Cyber Proxy

**Role**: gRPC security scanning service. SSRF prevention, URL reputation, and malware scanning.

- **Port**: 50053 (gRPC)
- **Standalone** (no service dependencies)
- **Key responsibilities**:
  - Block private IPs (RFC1918, link-local, loopback)
  - DNS rebinding protection
  - URL reputation checking (threat categorization)
  - Content malware scanning
  - HTTP proxying with header filtering

### 3.5 Audit Writer

**Role**: Immutable audit event persistence. Every action in Maple is recorded here.

- **Port**: 50054 (gRPC), 50055 (HTTP edge ingest)
- **Depends on**: PostgreSQL
- **Key responsibilities**:
  - Append-only event storage
  - Batch event ingestion
  - Bidirectional streaming for real-time audit feeds
  - Query with pagination and filtering
  - Dead-letter queue with replay
  - HTTP edge ingest (headers-only protocol for CDN collection)

### 3.6 Business API

**Role**: User accounts, organization management, and Stripe billing integration.

- **Port**: 3001 (HTTP)
- **Depends on**: PostgreSQL, Stripe
- **Key responsibilities**:
  - User CRUD, profile management
  - Organization hierarchy (teams, roles, invites)
  - Stripe subscription lifecycle
  - Entitlements and usage tracking

### 3.7 Tool Runner

**Role**: K8s job execution for long-running tool invocations.

- **Port**: 50056 (gRPC)
- **Depends on**: K8s API, Audit Writer
- **Key responsibilities**:
  - Spawn K8s jobs for tool execution
  - Timeout enforcement
  - OpenClaw modifier execution

### 3.8 Admin Console API

**Status**: Archived — merged into Gateway API (decommission 2026-03-04). All admin functionality now served via `/admin/api/*` routes on the gateway.

---

## 4. Gateway API — The HTTP Entry Point

The gateway hosts **~95 route modules** organized by domain:

### Route Groups

| Domain | Routes | Purpose |
|--------|--------|---------|
| **Authentication** | `/api/auth/login`, `/api/auth/register`, `/api/auth/google`, `/api/auth/forgot-password`, `/api/auth/verify-email/*`, `/api/auth/me`, `/api/auth/logout` | Session management, OAuth, password recovery |
| **Billing** | `/api/billing/subscriptions/*`, `/api/billing/user/*`, `/api/billing/webhook` | Stripe integration, subscription CRUD |
| **Firewall** | `/api/firewall/status`, `/api/firewall/chat`, `/api/firewall/decisions` | Real-time firewall status, AI-assisted policy chat |
| **Policy** | `/api/policies/*` | Firewall rule CRUD, testing, activation |
| **Traces** | `/api/traces/*`, `/api/traces/:id/steps` | Trace lifecycle, step ingestion, replay |
| **HITL Approvals** | `/api/hitl/pending`, `/api/hitl/watch` (SSE), `/api/hitl/decision` | Human-in-the-loop approval queue |
| **Downstream** | `/api/downstream/apps`, `/api/downstream/tools`, `/api/downstream/dispatch` | Downstream MCP app registry, tool discovery |
| **Orchestration** | `/api/orchestrations/*` | Execution graphs, workflows, approval gates |
| **Operations** | `/api/operations/orchestrations/step-up/*`, `/api/operations/orchestrations/escalation/*`, `/api/operations/orchestrations/break-glass/*` | Step-up auth, escalation chains, break-glass |
| **Observability** | `/api/observability/orchestrations/audit-log`, `/api/observability/orchestrations/audit-chain`, `/api/observability/orchestrations/dead-letter/*`, `/api/observability/orchestrations/alert-webhooks/*`, `/api/observability/orchestrations/retention` | Audit log export, dead-letter management, alert webhooks, retention policy |
| **OpenClaw** | `/api/openclaw/agent/*`, `/api/openclaw/cli/*`, `/api/openclaw/modifier/*` | Agent, CLI, and modifier runtime control |
| **GPT Adapter** | `/gpt/oauth/*`, `/gpt/tools/*`, `/.well-known/oauth-*` | OpenAI GPT plugin integration |
| **Platform** | `/api/org/*`, `/api/user/api-keys/*`, `/api/entitlements`, `/api/usage/*`, `/api/limits/*` | Organization management, API keys, usage |
| **Demo** | `/api/demo/sessions/*`, `/api/demo/flows/*` | Demo session management, guided flows |
| **MCP Tools** | `/mcp/*` | MCP protocol tool endpoints |
| **Health** | `/health`, `/ready` | Liveness and readiness probes |
| **Admin** | `/admin/api/*` | Admin dashboard, policy management |

### Request Lifecycle

```
HTTP Request
  → CORS middleware (ChatGPT origins allowed)
  → Request logging middleware (structured logs)
  → Request context (requestId, tenantId, sessionId, traceId)
  → Auth middleware (session / API key / OAuth)
  → Route handler
  → Audit event emission (fire-and-forget to audit-writer)
  → Response
```

---

## 5. Context Wall — The Policy Evaluation Engine

### gRPC Service Endpoints

| Method | Purpose |
|--------|---------|
| `EvaluateStep(TraceStep, RequestContext)` | Evaluate a single step against all rules |
| `EvaluateTrace(Trace, RequestContext)` | Evaluate an entire trace |
| `GetPolicyDecision(traceId, stepIndex, ...)` | Get decision for a specific step |
| `ListPolicyRules()` | List all active firewall rules |
| `SubmitApproval(traceId, stepIndex, action, reason)` | Submit HITL decision |
| `WatchApprovalQueue(sessionId)` | SSE stream of pending approvals |
| `ListPendingApprovals(sessionId)` | List pending approvals |

### Policy Rule Schema

```javascript
{
  name: "block-destructive-shell",        // Rule identifier
  action: "DENY",                         // ALLOW, DENY, LOG_ONLY
  severity: "CRITICAL",                   // LOW, MEDIUM, HIGH, CRITICAL
  message: "Destructive shell command blocked",
  recommendation: "Use targeted delete instead of recursive rm",
  stepTypes: ["SHELL", "TOOL_CALL"],      // Filter by step type
  toolGlob: "shell.*",                    // Glob pattern for tool names
  anyValueRegex: "rm\\s+-rf",            // Regex match on any step value
  secrets: false,                         // Detect PII/secrets
  payloadBytesExceeds: 0                 // Size limit (0 = disabled)
}
```

### Evaluation Pipeline

1. **Receive step** → Context Wall gets `TraceStep` with full context
2. **Rule matching** → Evaluate against all active rules (most restrictive wins)
3. **Risk scoring** → ML behavioral analysis, anomaly detection
4. **PII detection** → Scan for secrets, credit cards, SSNs, API keys
5. **Decision** → `ALLOW` (proceed), `DENY` (block), `PENDING_APPROVAL` (wait for human)
6. **Redaction** → Strip detected PII before audit logging
7. **Audit emission** → Log decision to audit-writer
8. **Tool dispatch** → If ALLOW, call MCP Proxy to execute

---

## 6. MCP Proxy — Tool Dispatch

### How Tool Execution Works

```
Gateway API
  → MCP Proxy.ExecuteTool(appId, toolName, args)
    1. Mint HMAC-signed credential (scoped to app+tool, seconds-lived)
    2. SSRF guard: call CyberProxy.CheckUrl(target)
    3. Execute tool against downstream MCP server
    4. Scan response: call CyberProxy.ScanContent(response)
    5. Emit audit event to AuditWriter
    6. Return result
```

### Tool Chain Execution

MCP Proxy supports fan-out execution across multiple downstream apps:

```javascript
ExecuteToolChain({
  appIds: ["app-1", "app-2", "app-3"],
  toolName: "analyze",
  argumentsJson: '{"query": "..."}',
})
// Executes tool on all three apps, returns aggregated results
```

### Credential Minting

Instead of passing raw API keys to downstream services, MCP Proxy mints short-lived HMAC-signed credentials:

```
Format: cred-{uuid}:{appId}:{toolName}:{timestamp}:{hmac}
Lifetime: seconds (one-time use)
Verification: HMAC-SHA256 with shared secret
```

---

## 7. Cyber Proxy — SSRF & Malware Scanning

### SSRF Guard

Every outbound URL is checked before the request is made:

```
Blocked IP ranges:
  - 10.0.0.0/8        (Private Class A)
  - 172.16.0.0/12     (Private Class B)
  - 192.168.0.0/16    (Private Class C)
  - 127.0.0.0/8       (Loopback)
  - 169.254.0.0/16    (Link-local)
  - ::1               (IPv6 loopback)

Additional protections:
  - DNS rebinding: resolve hostname, verify IP, then connect
  - Domain matching: exact-or-subdomain (not prefix)
  - Configurable allowlist: MAPLE_CYBER_PROXY_ALLOWED_HOSTS
```

### Content Scanning

```
CyberProxy.ScanContent(content, contentType, sourceUrl)
  → File hash matching (known malware signatures)
  → Pattern detection (malicious payloads)
  → Quarantine if threats found
  → Return: { safe, threats[], quarantined }
```

### URL Reputation

```
CyberProxy.GetReputation(url)
  → Threat categorization (malware, phishing, spam, C2)
  → Reputation score: 0.0 (trusted) → 1.0 (malicious)
  → Known-malicious detection
```

---

## 8. Audit Writer — Immutable Audit Chain

### Event Types (37 categories)

| Category | Events |
|----------|--------|
| **Policy** | `POLICY_EVALUATED`, `POLICY_DENIED`, `POLICY_ALLOWED`, `POLICY_LOG_ONLY` |
| **Secrets** | `SECRET_REDACTED` |
| **HITL** | `HITL_REQUESTED`, `HITL_APPROVED`, `HITL_REJECTED`, `HITL_TIMEOUT` |
| **Tools** | `TOOL_DISPATCHED`, `TOOL_COMPLETED`, `TOOL_FAILED`, `TOOL_CHAIN_STARTED`, `TOOL_CHAIN_COMPLETED` |
| **Credentials** | `CREDENTIAL_MINTED`, `CREDENTIAL_REVOKED`, `CREDENTIAL_EXPIRED` |
| **Security** | `URL_CHECKED`, `URL_BLOCKED`, `CONTENT_SCANNED` |
| **Proxy** | `PROXY_REQUEST` |
| **Model** | `MODEL_GENERATE`, `MODEL_STREAM` |
| **Traces** | `TRACE_CREATED`, `TRACE_UPDATED`, `TRACE_FORKED`, `TRACE_QUARANTINED` |
| **System** | `SERVICE_STARTED` |

### Outbox Pattern (Durable Delivery)

The gateway uses a durable outbox pattern to guarantee audit event delivery:

```
1. Event created → INSERT into gateway_audit_outbox (status: 'pending')
2. Background worker (leader-elected) picks up pending events
3. Sends to audit-writer via gRPC
4. On success → status = 'delivered'
5. On failure → exponential backoff retry (max 6 attempts)
6. After max retries → status = 'dead_letter'
7. Dead letters can be replayed manually via API
```

### Audit Chain Integrity

Each audit record includes a cryptographic hash chain:

```javascript
{
  sequenceId: 42,
  eventId: "evt-abc123",
  previousHash: "sha256-of-record-41",
  recordHash: "sha256-of-this-record",
  // recordHash = SHA256(eventId + eventType + timestamp + ... + previousHash)
}
```

This creates a **tamper-evident chain** — modifying any record breaks the hash chain, which is detectable by `verifyAuditChain()`.

### Export Formats

Audit logs can be exported in multiple formats:
- **JSON** — Standard JSON array
- **NDJSON** — Newline-delimited JSON (streaming)
- **CEF** — Common Event Format (SIEM integration)
- **Syslog** — RFC 5424 syslog format

---

## 9. Trace System — Execution Observability

### What is a Trace?

A **trace** represents a complete interaction between an AI agent and the tools it uses. It contains an ordered sequence of **steps** — each step is a single action (prompt, tool call, shell command, etc.).

### Trace Model

```javascript
{
  id: "trace-uuid",
  sessionId: "session-uuid",              // User session
  ownerKeyFingerprint: "key-fingerprint", // API key identity
  status: "active",                       // active | completed | quarantined
  source: "openai",                       // Agent platform
  startedAt: "2025-03-14T10:00:00Z",
  updatedAt: "2025-03-14T10:05:00Z",
  parentTraceId: null,                    // Non-null if forked
  forkedFromStep: null,                   // Fork split point
  tags: ["security-triage"],
  steps: [
    {
      index: 0,
      timestamp: "2025-03-14T10:00:01Z",
      actor: "AGENT",                     // AGENT | TOOL | SYSTEM | USER
      type: "PROMPT",                     // PROMPT | TOOL_CALL | SHELL | BROWSER | NETWORK | EMAIL | SYSTEM
      prompt: "Analyze the security logs",
      riskScore: 0.1,
      guardStatus: "ALLOW"               // ALLOW | BLOCK | PENDING
    },
    {
      index: 1,
      timestamp: "2025-03-14T10:00:05Z",
      actor: "AGENT",
      type: "TOOL_CALL",
      toolCall: {
        name: "read_file",
        inputJson: '{"path": "/var/log/auth.log"}',
        outputJson: '{"content": "..."}'
      },
      riskScore: 0.3,
      guardStatus: "ALLOW"
    },
    {
      index: 2,
      timestamp: "2025-03-14T10:00:10Z",
      actor: "AGENT",
      type: "SHELL",
      command: "grep 'Failed password' /var/log/auth.log | wc -l",
      output: "42",
      riskScore: 0.5,
      guardStatus: "ALLOW"
    }
  ]
}
```

### Trace Lifecycle

```
1. CREATE     → Agent ingests via POST /api/traces
2. INGEST     → Steps added via POST /api/traces/:id/steps
3. EVALUATE   → Each step evaluated by Context Wall
4. GUARD      → ALLOW → continue | BLOCK → quarantine | PENDING → await approval
5. AUDIT      → Every step emits audit event to Audit Writer
6. COMPLETE   → Mark status = "completed"
7. FORK       → Create child trace from any step (replay with modifications)
8. ARCHIVE    → Move to cold storage after retention period
```

### Trace Forking

Traces can be **forked** from any step, creating a new execution branch:

```
Original:  step0 → step1 → step2 → step3 → step4
Fork at step 2:
  Original:  step0 → step1 → step2 → step3 → step4
  Fork:      step0 → step1 → step2 → NEW_step3 → NEW_step4
```

This enables "what-if" analysis: replay an agent interaction with different inputs/rules.

### Storage

- **In-memory**: `TraceStore` cache (configurable max traces, LRU eviction, TTL)
- **Database**: PostgreSQL (loaded on startup, persisted on every upsert)
- **Community**: `SharedTraceStore` for anonymized public traces

---

## 10. OpenClaw — Agent/CLI/Modifier Orchestration

OpenClaw provides three runtimes integrated into the gateway:

### 10.1 Agent Runtime

Spawns and manages external OpenClaw agent processes:

```
Modes:
  - local-dev:      Agent runs as child process
  - agent-managed:  Agent manages its own lifecycle
  - bridge-managed: External bridge controls agent

Limits:
  - Max 1000 sessions (TTL: 2h)
  - Max 5000 runs (TTL: 1h)
  - Eviction sweep every 60s
```

### 10.2 CLI Runtime

Command-line executor for policy validation and infrastructure tasks:

```
Features:
  - execFile() based execution
  - stdin/stdout capture
  - Timeout enforcement
  - Structured output parsing
```

### 10.3 Modifier Runtime

Background job executor for approval chains, break-glass, and escalation:

```
States:
  PENDING_EXECUTION → EXECUTING → COMPLETED
                                → FAILED
                                → QUARANTINED

Features:
  - Approval-first: HITL gates execution
  - Durable persistence (@maple/persistence)
  - Audit outbox for guaranteed event delivery
  - Alert webhooks for real-time notifications
```

---

## 11. Orchestration Engine — Execution Graphs & Workflows

### What is an Orchestration?

An orchestration is a **directed acyclic graph (DAG)** of tasks that execute with dependencies, approval gates, and error handling.

### Execution Model

```javascript
{
  id: "exec-uuid",
  definitionId: "def-uuid",
  status: "running",           // pending | running | completed | failed | paused
  graph: {
    nodes: [
      { id: "n1", type: "task", name: "Implement feature" },
      { id: "n2", type: "task", name: "Write tests" },
      { id: "n3", type: "approval", name: "Code review" },
      { id: "n4", type: "task", name: "Deploy" }
    ],
    edges: [
      { from: "n1", to: "n3" },    // n1 → approval gate
      { from: "n2", to: "n3" },    // n2 → approval gate
      { from: "n3", to: "n4" }     // approval → deploy
    ]
  },
  nodeStates: {
    "n1": { status: "completed" },
    "n2": { status: "running" },
    "n3": { status: "blocked" },   // Waiting for n1+n2
    "n4": { status: "pending" }
  }
}
```

### Builtin Templates

1. **Manager + 3 Coding Workers** — Parallel implementation, review, and test tasks
2. **Manager + 3 Email Workers** — Parallel email drafting, QA, and follow-up
3. **Security Triage Manager** — Incident response with policy, comms, and remediation tracks

### Controls

| Action | Endpoint |
|--------|----------|
| Create execution | `POST /api/orchestrations` |
| Pause | `POST /api/orchestrations/:id/pause` |
| Resume | `POST /api/orchestrations/:id/resume` |
| Cancel | `POST /api/orchestrations/:id/cancel` |
| Fork | `POST /api/observability/orchestrations/executions/:id/fork` |
| Watch events | `GET /api/orchestrations/:id/events` (SSE) |
| Get graph | `GET /api/orchestrations/:id/graph` |
| Get timeline | `GET /api/orchestrations/:id/timeline` |
| Submit approval | `POST /api/orchestrations/:id/nodes/:nodeId/decision` |

---

## 12. Authentication System

Maple supports four authentication methods:

### 12.1 Session Cookies

```
Type:    HTTP-only, Secure, SameSite=Strict
Signed:  HMAC with signing key
TTL:     Configurable (default 24h)
Stores:  userId, sessionId, keyFingerprint
Used by: Web frontends (A, B, C)
```

### 12.2 API Keys

```
Format:   maple_xxxx (prefix verification)
Signed:   HMAC-SHA256 validation
Scopes:   read, write, admin
Config:   MAPLE_API_KEY, MAPLE_API_KEYS (comma-separated)
Used by:  CLI, SDK, integrations
```

### 12.3 Google OAuth

```
Flow:    OpenID Connect
Verify:  JWT signature against Google JWKS
Guards:  email_verified must be true; allowSelfSignup must be enabled
Config:  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
```

### 12.4 GPT OAuth

```
Flow:    Authorization code + PKCE (S256)
Codes:   HMAC-signed (cross-pod safe, no shared store)
Tokens:  HMAC-signed self-validating access tokens
Guard:   redirect_uri allowlist, client_secret required
```

### Auth Context

Every request carries an auth context via `AsyncLocalStorage`:

```javascript
authContextStorage.getStore() → {
  userId: "user-123",
  keyFingerprint: "fp-abc",
  sessionId: "sess-456",
  method: "session" | "api_key" | "google" | "gpt_oauth"
}
```

---

## 13. Tenant Isolation & Multi-Tenancy

### Tenant Binding Model

```javascript
{
  id: "bind-uuid",
  userId: "user-123",
  tenantId: "tenant-abc",
  orgId: "org-xyz",
  roleId: "member",         // member | admin | owner
  status: "active",         // active | inactive
  boundAt: "2025-01-01T00:00:00Z",
  unboundAt: null,           // Set when revoked
  boundBy: "system"
}
```

### Signed Tenant Claims

To prevent header spoofing, tenant scope is cryptographically signed:

```
Format: {hmac}.{iat}.{maxAgeMs}
Example: abc123def456.1710432000000.300000

Signature covers: userId + tenantId + orgId + iat
Default expiry: 5 minutes (300000ms)

Verification flow:
  1. Parse signature → extract iat, maxAgeMs
  2. Reject if expired (Date.now() - iat > maxAgeMs)
  3. Verify HMAC matches
  4. ALWAYS check DB binding (signature alone is not sufficient)
  5. Return verified scope only if both signature + binding are valid
```

### Isolation Guarantees

- Per-user scoped API keys
- Per-tenant firewall policies
- Per-org approval chains and escalation rules
- Cross-tenant queries blocked at route level
- Tenant binding cache (60s TTL) for performance

---

## 14. Escalation Chains & Break-Glass

### Escalation Chains

Multi-level on-call escalation for HITL approvals:

```javascript
{
  chainName: "default",
  levels: [
    { level: 0, approverIds: ["user-1", "user-2"], notificationChannels: ["email"] },
    { level: 1, approverIds: ["user-3"], notificationChannels: ["email", "slack"] },
    { level: 2, approverIds: ["user-4"], notificationChannels: ["email", "slack", "pagerduty"] }
  ],
  escalationTimeoutSeconds: 300    // 5 minutes per level
}

Flow:
  1. HITL approval triggered → assign to level 0
  2. Notify level 0 approvers (email)
  3. Wait 5 minutes for decision
  4. Timeout → auto-escalate to level 1
  5. Notify level 1 approvers (email + slack)
  6. Continue until decision or all levels exhausted
```

### Break-Glass

Emergency override for time-critical situations:

```javascript
{
  id: "bg-uuid",
  userId: "user-123",           // Who invoked
  reason: "Production outage",  // Required justification
  justification: "Database locked, need to kill blocking process",
  actionTaken: "Approved shell: kill -9 12345",
  reviewStatus: "pending_review",   // pending_review | approved | rejected
  reviewedBy: null,                 // Security reviewer
  reviewNotes: ""
}

Flow:
  1. User clicks "Break Glass" → provide reason + justification
  2. Immediate execution (bypasses HITL)
  3. Immutable audit event created
  4. Post-hoc review required (within 24h)
  5. If rejected → escalated to CISO, policy violation recorded

Guarantees:
  - Mandatory written justification
  - Immutable audit trail (cannot be deleted)
  - Self-review prevention (reviewer != invoker)
  - Rate limiting (configurable per-user cap)
```

---

## 15. Alert Webhooks

### Webhook Configuration

```javascript
{
  id: "wh-uuid",
  tenantId: "tenant-abc",
  webhookUrl: "https://ops.example.com/maple-alerts",
  secret: "hmac-sha256-signing-key",
  alertTypes: ["dangerous_approval", "break_glass", "slo_breach"],
  enabled: true
}
```

### Alert Types

| Type | Trigger |
|------|---------|
| `slo_breach` | Response time exceeded threshold |
| `dangerous_approval` | High-risk action approved by human |
| `break_glass` | Emergency override invoked |
| `audit_delivery_failure` | Audit event delivery failed |
| `rate_limit_exceeded` | Per-user rate limit hit |
| `escalation_triggered` | HITL escalated to next level |
| `policy_violation` | Tool call blocked by firewall |

### Delivery

```
POST https://ops.example.com/maple-alerts
Headers:
  X-Maple-Signature: sha256=<HMAC of body>
  Content-Type: application/json

Body:
{
  "alertType": "dangerous_approval",
  "traceId": "trace-123",
  "severity": "HIGH",
  "timestamp": "2025-03-14T15:30:00Z",
  ...
}

Retry: exponential backoff, max 6 attempts
Dead-letter: failed deliveries saved for manual replay
```

---

## 16. Frontend Surfaces

### FrontendA: IT Console (Protocol)

**Audience**: Ops, security, and compliance teams

**Features**:
- Trace observability (replay, risk audit, fork)
- Policy management (rule CRUD, testing)
- Approval queue (HITL decisions)
- Audit log viewer (immutable history, multi-format export)
- Webhook and alert configuration
- Team/org management

**URL**: `http://127.0.0.1:4101`

### FrontendB: Desktop App (Catalyst)

**Audience**: Engineers and agent architects

**Features**:
- Orchestration execution graph (DAG visualization)
- Agent/CLI/modifier management
- Live execution timeline
- Tool availability matrix
- Agent hot-reload

**Packaging**: Electron (`.exe`, `.dmg`, `.AppImage`)
**URL**: `http://127.0.0.1:4102`

### FrontendC: Marketing Download Site (Salient)

**Audience**: Prospective users

**Features**:
- Landing pages, pricing, documentation
- Download CTAs for desktop app
- Onboarding flows

**URL**: `http://127.0.0.1:4103`

### FrontendD: MCP Widgets

**Audience**: Integration/SDK users

**Features**:
- Embeddable UI components
- Maple UI widgets for partner products

---

## 17. Shared Packages (Monorepo Internals)

Located at `backend/backendB-core-services/shared/packages/`:

| Package | Purpose |
|---------|---------|
| **@maple/common** | `mapleLog()` structured logging, `CircuitBreaker`, `startGrpcServer()`, `gracefulShutdown()`, gRPC TLS config, connection pooling |
| **@maple/security** | API key loading, `PolicyStore`, `enforceTraceFirewall()`, `detectPromptInjection()`, `scanForPII()`, `redactPII()`, policy DSL parsing |
| **@maple/persistence** | `MaplePostgresDatabase`, schema initialization, trace/audit/policy persistence, query builders |
| **@maple/risk-engine** | `analyzeTraceRisks()`, behavioral risk analysis, community baseline comparison, anomaly detection |
| **@maple/types** | Protobuf-generated TypeScript types, shared interfaces |
| **@maple/proto-ts** | Compiled protobuf TypeScript stubs, service client stubs |

---

## 18. Data Models & Persistence

### PostgreSQL Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts (id, email, password_hash) |
| `api_keys` | API keys (key, fingerprint, scopes, secret_hash) |
| `sessions` | Web sessions (session_id, user_id, expires_at) |
| `traces` | Trace records (id, owner_id, status, steps_json) |
| `shared_traces` | Community traces (anonymized, risk-scored) |
| `audit_chain` | Immutable hash-chained audit log |
| `gateway_audit_outbox` | Durable audit delivery queue |
| `user_tenant_bindings` | Multi-tenancy (user_id, tenant_id, org_id, role_id) |
| `policies` | Firewall rules (name, action, pattern_json) |
| `modifier_step_up_verifications` | Step-up auth challenges |
| `modifier_escalation_chains` | Escalation configs |
| `modifier_escalation_events` | Escalation history |
| `modifier_break_glass_events` | Break-glass audit trail |
| `modifier_alert_webhooks` | Webhook configs |
| `modifier_alert_delivery_log` | Webhook delivery history |
| `audit_retention_configs` | Per-tenant retention policies |
| `subscriptions` | Billing subscriptions (Stripe) |

### In-Memory Stores

| Store | Capacity | TTL | Eviction |
|-------|----------|-----|----------|
| `TraceStore` | 2000 traces | 24h | LRU + TTL |
| `SessionStore` (OpenClaw) | 1000 sessions | 2h | Sweep every 60s |
| `RunStore` (OpenClaw) | 5000 runs | 1h | Sweep every 60s |
| `TENANT_BINDING_CACHE` | Unbounded | 60s | TTL per entry |
| `PolicyStore` | Unbounded | Hot-reload every 30s | Full replace |

---

## 19. Security Patterns

### Defense in Depth

| Layer | Protection |
|-------|------------|
| **Network** | SSRF guard blocks private IPs, DNS rebinding protection |
| **Authentication** | 4 auth methods, HMAC-signed tokens, constant-time comparison |
| **Authorization** | RBAC (owner > admin > member), tenant isolation, signed claims |
| **Input validation** | Policy engine evaluates every tool call before execution |
| **Output scanning** | Content malware scanning on all tool responses |
| **PII protection** | Auto-detect and redact secrets, credit cards, SSNs, API keys |
| **Audit** | Immutable hash-chained log, durable outbox delivery |
| **Rate limiting** | Per-IP throttling on auth endpoints (5 req/15min) |
| **HITL** | Human approval gates for high-risk actions |
| **Break-glass** | Emergency override with mandatory post-hoc review |

### Key Security Properties

1. **Fail-closed**: Unavailable DB → deny access (not allow)
2. **Tenant isolation**: Signed claims + DB binding required (signature alone insufficient)
3. **Constant-time auth**: All API key comparisons use timing-safe equality
4. **Credential scoping**: HMAC-signed, seconds-lived, single-use credentials
5. **Atomic operations**: Step-up auth uses CAS (Compare-And-Swap) to prevent races
6. **Tamper evidence**: Audit chain with cryptographic hash linking

---

## 20. Deployment

### Local Development

```bash
npm install
npm run dev
# Gateway:   http://127.0.0.1:3000
# FrontendA: http://127.0.0.1:4101
# FrontendB: http://127.0.0.1:4102
# FrontendC: http://127.0.0.1:4103
```

### Railway (Simple SaaS)

```bash
npm run predeploy          # Validation + asset sync
npm run build              # Build all services
railway deploy             # Push to Railway
```

Entrypoint: `backend/backendA-platform-infra/deploy/railway-entrypoint.sh`

### Northflank (Kubernetes-Ready)

Template: `backend/backendA-platform-infra/deploy/northflank/template.backend-mesh.json`

### Kubernetes

```bash
npm run validate:k8s       # Validate manifests
npm run gate:k8s          # Release gate
kubectl apply -f backend/backendA-platform-infra/k8s/
```

### Service Ports

| Service | Protocol | Port |
|---------|----------|------|
| Gateway API | HTTP | 3000 |
| Business API | HTTP | 3001 |
| Context Wall | gRPC | 50051 |
| MCP Proxy | gRPC | 50052 |
| Cyber Proxy | gRPC | 50053 |
| Audit Writer | gRPC | 50054 |
| Audit Writer (edge) | HTTP | 50055 |
| Tool Runner | gRPC | 50056 |

### Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `MAPLE_API_KEY` | Bootstrap admin API key |
| `MAPLE_TENANT_CLAIM_SIGNING_KEY` | Tenant claim HMAC key |
| `OPENAI_API_KEY` | Firewall chat (primary) |
| `ANTHROPIC_API_KEY` | Firewall chat (fallback) |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `STRIPE_SECRET_KEY` | Billing integration |
| `MAPLE_OPENCLAW_AGENT_ENABLED` | Enable agent runtime |
| `MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_ENABLED` | Enable durable audit |
| `NODE_ENV` | `production` disables no-auth bypass |

---

## 21. Testing & Quality Gates

### Test Suites

```bash
npm test                          # All tests
npm run test:mesh-services       # Core service unit tests
npm run test:saas-services       # Business API tests
npm run test:infra-scripts       # Platform scripts
npm run test:providers-live      # Live provider E2E (requires API keys)
```

### Quality Checks

```bash
npm run check:repo-hygiene                # Lockfile, deps, formatting
npm run check:command-surface             # MCP command coverage
npm run check:no-legacy-modifier-endpoints # API deprecation
npm run check:service-topology-parity     # Railway/K8s/mesh alignment
npm run check:service-route-coverage      # Route → service mapping
npm run check:service-necessity           # Service utilization
```

### CI/CD Gates (Branch Protection)

1. `backend-checks` — Tests + linting + type checks
2. `frontend-tests` — Frontend unit + E2E tests
3. `k8s-release-gate` — K8s manifest validation + deployment dry-run

### Validation Loops

| Loop | Purpose | Duration |
|------|---------|----------|
| Fast local | Unit + integration | ~30s |
| K8s validation | Manifest apply, network policy check | ~2min |
| K8s release gate | Full deployment dry-run, health checks | ~5min |
| Full matrix | All tests, live providers, debt analysis | ~30min |
