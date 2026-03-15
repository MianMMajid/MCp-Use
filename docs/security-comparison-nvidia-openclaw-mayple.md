# Security Comparison: NVIDIA NeMo Guardrails vs OpenClaw vs Mayple

## Executive Summary

Three fundamentally different approaches to AI agent security:

| | NVIDIA NeMo Guardrails | OpenClaw | Mayple |
|--|----------------------|----------|--------|
| **What it is** | SDK/library you embed in your agent code | Open-source AI agent (the agent itself) | External firewall proxy between agents and tools |
| **Security model** | Content filtering + dialog control | Sandbox isolation + auth gates | Policy-based tool call interception |
| **Integration** | Requires code changes to agents | Is the agent — runs its own tools | Zero code changes — proxy layer |
| **Scope** | Single agent's I/O | Single operator's tools | Cross-agent, cross-provider |
| **Who configures** | Developers (Python/Colang) | Operators (YAML config) | Ops teams (no-code UI) |

---

## 1. NVIDIA NeMo Guardrails

### What It Does

NeMo Guardrails is an open-source **SDK** that developers embed inside their LLM applications to filter inputs, outputs, and dialog flows. It uses a custom language called **Colang** (Python-like syntax) to define guardrail rules.

### Security Measures

**Five Rail Types:**

| Rail | When | What It Does |
|------|------|-------------|
| **Input Rails** | Before user input reaches the LLM | Content safety screening, topic control, jailbreak detection |
| **Output Rails** | After LLM generates a response | Validates responses don't contain harmful/off-topic content |
| **Dialog Rails** | During conversation flow | Controls conversation trajectory, prevents topic derailing |
| **Retrieval Rails** | During RAG chunk retrieval | Validates retrieved context is appropriate |
| **Execution Rails** | During tool/action calls | Monitors agent actions for unexpected behavior |

**Three NIM Microservices (2025-2026):**

1. **Content Safety NIM** — Screens for harmful outputs using 42 safety hazard categories. Trained on the Aegis Content Safety Dataset (35,000 human-annotated samples). Uses `Llama 3.1 NemoGuard 8B ContentSafety`.

2. **Topic Control NIM** — Keeps conversations on approved topics. Uses `Llama 3.1 NemoGuard 8B TopicControl`.

3. **Jailbreak Detection NIM** — Identifies malicious prompts using 17,000 known attack patterns. Uses `NemoGuard JailbreakDetect`.

**Tool Call Security:**
- Execution rails can be applied to tool calls
- Event-driven architecture intercepts at: user input, LLM inference, tool invocation, action results
- MCP integration via NeMo Agent Toolkit (compatible with LangChain, CrewAI, Semantic Kernel, Google ADK)

**Performance:** ~500ms additional latency for guardrail evaluation. 50% improvement in protection metrics in NVIDIA's testing.

### Strengths
- ML-based detection (not just regex patterns)
- GPU-accelerated for low latency
- Enterprise-backed with Cisco, Palo Alto Networks integrations
- Colang DSL is expressive for complex dialog policies

### Limitations
- **Requires code changes** — must be embedded in agent code
- **Single-agent scope** — each agent needs its own guardrails instance
- **Developer-operated** — Colang/Python required; no ops-friendly UI
- **Content-focused** — strong on content filtering, weaker on tool call governance
- **No human-in-the-loop approval** — blocks or allows, no approval queue
- **No cross-agent visibility** — can't see traces across multiple agents/providers

---

## 2. OpenClaw

### What It Does

OpenClaw is an **open-source AI agent** (not a security layer — it IS the agent). It can connect to LLMs, integrate with external APIs, and autonomously execute tasks. Since November 2025, it has grown to 300,000-400,000 users. Security is one dimension of its architecture, not its primary purpose.

### Security Measures

**Authentication & Authorization:**

| Layer | Implementation |
|-------|---------------|
| **Gateway Auth** | Token-based, password, or trusted-proxy. Fail-closed by default. |
| **DM Policies** | `pairing` (default), `allowlist`, `open`, `disabled` — controls who can talk to the agent |
| **Command Authorization** | Slash commands honor sender auth derived from channel allowlists |
| **Access Groups** | Controls which authorized senders can invoke directives |

**Trust Model:** Explicitly targets a **personal assistant model** — "one trusted operator boundary, potentially many agents." NOT a multi-tenant security boundary. Multi-user isolation requires separate gateways per trust domain.

**Sandboxing (Docker-based):**

| Feature | Details |
|---------|---------|
| **Container isolation** | Tool execution in Docker with configurable workspace access (`none`, `ro`, `rw`) |
| **Sandbox scope** | `agent`, `session`, `shared` — controls isolation granularity |
| **Filesystem restrictions** | `tools.fs.workspaceOnly: true` restricts file ops to workspace dirs |
| **Blocked bind sources** | `docker.sock`, `/etc`, `/proc`, `/sys`, `/dev` blocked by default |
| **Network control** | Configurable per-container network access |

**Three permission gates for sandboxed agents:**
1. Agent-level tool permissions (`agents.list[].tools.allow/deny`)
2. Sandbox-level tool filter (`tools.sandbox.tools.allow`)
3. Network access for the container (`sandbox.docker.network`)

**Tool Policy:**

| Category | Controls |
|----------|----------|
| **Control-plane tools** | `gateway`, `cron` restricted by default (can reconfigure gateway) |
| **Elevated tools** | Require explicit opt-in via `tools.elevated.allowFrom` |
| **Browser control** | Treated as operator-level access; dedicated profiles recommended |
| **Dangerous tool deny** | Configurable: `tools.deny: ["gateway", "cron"]` |

**Credential Management:**
- Secrets stored in `~/.openclaw/credentials/` (file-based, 600 permissions)
- SecretRef authentication — references credentials from secure secret managers instead of embedding API keys
- File permissions enforced: `700` on dirs, `600` on files

**Network Isolation:**
- Default binding: `loopback` (local only)
- Tailscale integration for encrypted tunnels
- Reverse proxy hardening with `trustedProxies` config
- SSRF guards available

**Security Audit Tool:**
- Built-in `openclaw security audit` command
- 30+ checks across inbound access, tool exposure, network binding, browser control, permissions, plugins
- Auto-fixable items with `--fix` flag

### Security Incidents (2026)

- **512 vulnerabilities** found in late January 2026 audit (8 critical)
- **21,639 exposed instances** found publicly accessible (Censys scan)
- **CVE-2026-25253**: One-click RCE via Control UI WebSocket — unauthenticated host-level code execution in <90 seconds
- February 2026: `auth: none` removed as a configuration option

### Strengths
- Comprehensive sandbox isolation via Docker
- Multi-layer permission model (agent, sandbox, network)
- Built-in security audit tooling
- Active security response (CVE patches)

### Limitations
- **Not a security product** — security is one aspect of an agent framework
- **Personal-operator trust model** — not designed for multi-tenant enterprise
- **File-based secrets** — no HSM or vault integration by default
- **Pattern-based prompt injection** — acknowledges "prompt injection is not solved"
- **No cross-agent visibility** — each OpenClaw instance is isolated
- **No policy-as-code for tool calls** — uses YAML allow/deny lists, not rule evaluation
- **Critical vulnerabilities in 2026** — demonstrates the challenge of securing autonomous agents

---

## 3. Mayple

### What It Does

Mayple is an **external proxy firewall** that sits between any AI agent and its tools. It intercepts every tool call via MCP proxy, evaluates it against configurable policies, and either allows, blocks, or queues for human approval — without requiring code changes to agents.

### Security Measures

**Policy Engine (Context-Wall):**

The firewall evaluates each tool call step through a priority-ordered pipeline:

```
Step arrives --> Check context completeness
             --> Prompt injection detection (>= 0.7 confidence = DENY)
             --> PII/PHI scanning (critical/high = DENY)
             --> Policy rule evaluation (worst-match wins)
             --> Default action (allow/deny/log_only)
```

**8 Built-in Firewall Rules:**

| Rule | Severity | What It Blocks |
|------|----------|---------------|
| `block-ssh-keys` | deny | `.ssh/`, `id_rsa`, `id_ed25519`, `id_ecdsa` |
| `block-env-files` | deny | `.env` files and environment configs |
| `block-credential-files` | deny | `.aws/credentials`, `.npmrc`, `.docker/config.json`, `.kube/config` |
| `block-destructive-commands` | deny | `rm -rf`, `mkfs`, `dd if=`, `format` |
| `block-pipe-to-shell` | deny | `curl\|bash`, `wget\|sh` piping patterns |
| `block-reverse-shells` | deny | `nc -e`, `/dev/tcp/`, `bash -i >&`, `mkfifo`, `socat` |
| `block-secret-leakage` | deny | AWS keys, GitHub tokens, OpenAI keys, private keys, JWTs, Slack tokens, DB URLs |
| `log-large-payload` | log_only | Payloads > 100KB |

Rules are extensible via hot-reloadable external policy files and match on: step type, tool name (glob), regex patterns, secret detection, payload size.

**Prompt Injection Detection (25 patterns, 5 categories):**

| Category | Patterns | Example |
|----------|---------|---------|
| Instruction override | 7 | "ignore all previous instructions", "new instructions:", "you are now" |
| Role confusion | 4 | DAN/STAN jailbreaks, "pretend you are", "ai without restrictions" |
| Encoding evasion | 3 | base64 payloads, hex escapes, unicode escapes |
| Delimiter injection | 3 | Markdown system blocks, XML `<system>` tags, JSON role injection |
| Payload smuggling | 3 | Zero-width chars, homoglyph attacks, RTL override |

Confidence scoring: blocks at >= 0.7, logs at >= 0.4.

**PII/PHI Detection (DLP Engine):**

| Data Type | Validation |
|-----------|-----------|
| SSN | Regex + area code validation (rejects 000, 666, 900-999) |
| Credit cards | Regex + Luhn checksum validation |
| Email | Standard email regex |
| Phone (US + intl) | Multiple format variants |
| IP addresses | Octet range validation |
| Date of birth | Contextual pattern matching |
| Medical record numbers | Contextual MRN pattern |
| Patient names | Contextual "patient name:" pattern |

Severity escalation: 3+ findings in one step escalates severity one level.

**Secret Pattern Detection (8 patterns):**

| Secret Type | Pattern |
|-------------|---------|
| AWS access key | `AKIA[0-9A-Z]{16}` |
| GitHub token | `gh[ps]_...` / `github_pat_...` |
| OpenAI key | `sk-[A-Za-z0-9]{20,}` |
| Anthropic key | `sk-ant-...` |
| Private key header | `-----BEGIN (RSA\|EC\|DSA\|OPENSSH) PRIVATE KEY-----` |
| JWT token | `eyJ...` (3-segment base64) |
| Slack token | `xox[bpoas]-...` |
| Database URL | `postgres://`, `mysql://`, `mongodb://`, `redis://` |
| Generic (40-char) | Shannon entropy threshold >= 4.5 (filters false positives) |

**SSRF Protection (Cyber-Proxy):**

| Check | Details |
|-------|---------|
| Cloud metadata | Blocks `169.254.169.254`, `fd00:ec2::254` |
| Private IPs | Blocks 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 |
| DNS rebinding | Resolves hostname, re-validates resolved IP isn't private |
| Domain blocklist | Configurable per-tool |
| Domain allowlist | Per-tool and per-credential scope enforcement |

**Download Quarantine:**

| Check | Details |
|-------|---------|
| Content type blocklist | `.exe`, `.dll`, `.bat`, `.ps1`, `.jar`, `.sh` + 10 more |
| Magic byte detection | PE (MZ), ELF, Mach-O, ZIP, Java class headers |
| Base64 executable scan | Detects base64-encoded binaries in text content |
| XSS in HTML | `<script>`, `javascript:`, `on\w+=`, `<iframe>` |
| Credential scoping | `max_bytes`, `domain` whitelist, `download:blocked` per credential |

**Risk Scoring Engine:**

Step-level: `max(severity_weights) + 8 * (flag_count - 1)`, capped at 100.

Trace-level:
```
score = max_step_score * 0.55 + critical * 18 + high * 9 + medium * 4 + low * 1
```

8 risk detection rules: destructive shell, RCE, privilege escalation, credential access, data exfiltration, suspicious network targets, untrusted source downloads, external browser actions.

Anomaly detection: flags risk spikes (40+ point jumps) and repeat command loops (3+ same command).

**Human-in-the-Loop (HITL):**

When a step is blocked:
1. Enqueued in approval queue with full context
2. Audit event emitted (`HITL_REQUESTED`)
3. Ops team sees it in real-time via SSE stream
4. 5-minute timeout (configurable)
5. Approved -> proceeds with execution + audit trail
6. Rejected -> denied + audit trail
7. Timeout -> denied + audit trail

**Signed Credential System:**
- HMAC-SHA256 signed short-lived credentials (1-hour TTL)
- Per-tool, per-app scoping
- Replaces the retired secrets-broker service

**Audit Trail:**
- JSONL audit logs per day
- SHA256 deduplication
- Events: HITL requested/approved/rejected/timeout, tool completed/failed, URL blocked, content scanned, policy evaluated
- PostgreSQL persistence via audit-writer gRPC service

### Strengths
- **Zero code changes** — proxy architecture means any agent works
- **Cross-agent visibility** — single pane across all providers
- **Human-in-the-loop** — real approval queue with SSE, not just block/allow
- **No-code policy management** — ops teams, not developers
- **Layered defense** — prompt injection + PII/DLP + secrets + SSRF + download quarantine + risk scoring
- **Hot-reloadable policies** — no redeploy needed

### Limitations
- **Pattern-based detection** — regex, not ML models (unlike NVIDIA's NIM microservices)
- **In-memory approval queue** — lost on restart (no persistent queue)
- **No sandbox isolation** — doesn't run tools in containers (unlike OpenClaw)
- **Rule-based risk scoring** — not ML-trained anomaly detection
- **Prompt injection at 0.7 threshold** — 25 patterns vs NVIDIA's 17,000
- **No Colang-equivalent** — no DSL for complex dialog flow policies

---

## Side-by-Side Comparison

### Architecture

| Dimension | NVIDIA NeMo | OpenClaw | Mayple |
|-----------|------------|----------|--------|
| **Deployment** | Embedded SDK in agent code | The agent itself | External proxy (MCP) |
| **Code changes** | Required (Python/Colang) | N/A (is the agent) | Zero |
| **Scope** | Single agent | Single operator | Cross-agent, cross-provider |
| **Protocol** | Python API | Custom gateway protocol | MCP + gRPC |

### Security Controls

| Control | NVIDIA NeMo | OpenClaw | Mayple |
|---------|------------|----------|--------|
| **Content safety** | ML model (42 categories) | Not built-in | Regex (PII/PHI/secrets) |
| **Jailbreak detection** | ML model (17K patterns) | Pattern + model strength | Regex (25 patterns, 5 categories) |
| **Topic control** | ML model (NIM) | Not built-in | Not built-in |
| **Tool call interception** | Execution rails (Colang) | Allow/deny lists (YAML) | Policy engine (regex + rules) |
| **SSRF protection** | Not built-in | Available (guards) | Full (private IPs, DNS rebinding, metadata) |
| **Download quarantine** | Not built-in | Not built-in | Full (magic bytes, content types, base64) |
| **Secret detection** | Not built-in | SecretRef (storage) | 8 patterns + Shannon entropy |
| **Sandbox isolation** | Not applicable | Docker containers | Not built-in |
| **Human approval queue** | Not built-in | Exec approvals | Full HITL with SSE + timeout |
| **Risk scoring** | Not built-in | Not built-in | Rule-based (8 rules + anomaly) |
| **Audit trail** | Not built-in | Session transcripts | Immutable JSONL + PostgreSQL |
| **Cross-agent traces** | No | No | Yes |
| **No-code config** | No (Colang/Python) | Partial (YAML) | Yes (UI) |

### Who Should Use What

| Scenario | Best Choice | Why |
|----------|-------------|-----|
| Embedding safety in a single LLM app | **NVIDIA NeMo** | ML-based content filtering is superior; SDK integrates directly |
| Running a personal AI assistant securely | **OpenClaw** | Docker sandbox + multi-layer permissions for local use |
| Securing multiple agents across providers | **Mayple** | Cross-agent proxy; no code changes; HITL approval |
| Enterprise compliance & audit | **Mayple** | Immutable audit trail; per-user policies; export for regulators |
| Preventing toxic/harmful LLM output | **NVIDIA NeMo** | 42-category ML model trained on 35K samples |
| Stopping destructive tool calls | **Mayple** | 8 hardcoded rules + custom policies + approval queue |
| Sandboxing tool execution | **OpenClaw** | Docker containers with filesystem/network isolation |

---

## How Mayple Could Strengthen Its Position

Based on this analysis, areas where Mayple could adopt techniques from NVIDIA and OpenClaw:

### From NVIDIA NeMo Guardrails
1. **ML-based detection** — Replace regex prompt injection (25 patterns) with an ML classifier. NVIDIA's jailbreak model uses 17,000 patterns and achieves significantly better coverage.
2. **Content safety categorization** — NVIDIA has 42 hazard categories. Mayple's PII/PHI detection is strong but doesn't cover broader content safety (hate speech, self-harm, violence).
3. **Topic control** — NVIDIA's topic control NIM prevents off-topic conversations. Mayple has no equivalent — agents can discuss anything outside tool call scope.
4. **Dialog flow policies** — Colang allows expressing complex conversation constraints. Mayple's policy engine only evaluates individual tool calls, not conversation trajectories.

### From OpenClaw
1. **Sandbox isolation** — OpenClaw runs tools in Docker containers with configurable filesystem/network access. Mayple intercepts but doesn't isolate execution. Adding optional sandbox dispatch would create defense-in-depth.
2. **Built-in security audit CLI** — OpenClaw's `security audit` command checks 30+ security dimensions with auto-fix. Mayple could add `maple security audit` for deployment hardening.
3. **Persistent credential management** — OpenClaw's SecretRef pattern (reference credentials from secret managers) is cleaner than Mayple's HMAC-signed short-lived tokens for certain use cases.
4. **Multi-layer permission gates** — OpenClaw's three-gate model (agent-level, sandbox-level, network-level) provides defense-in-depth that Mayple's single policy engine doesn't match.

### What Mayple Already Does Better Than Both
1. **Cross-agent visibility** — Neither NVIDIA nor OpenClaw can see across multiple agents/providers
2. **Human-in-the-loop approval** — Real approval queue with SSE streaming, timeouts, and full audit
3. **Zero code changes** — Proxy architecture means any agent works immediately
4. **No-code policy management** — Ops teams can set rules without engineering
5. **Comprehensive DLP** — PII/PHI detection with Luhn validation, entropy-filtered secrets
6. **SSRF protection** — Full DNS rebinding checks, cloud metadata blocking, credential scoping

---

## Sources

- [NVIDIA NeMo Guardrails - Developer Page](https://developer.nvidia.com/nemo-guardrails)
- [NVIDIA NeMo Guardrails - GitHub](https://github.com/NVIDIA-NeMo/Guardrails)
- [NVIDIA NIM Microservices for Agentic AI](https://blogs.nvidia.com/blog/nemo-guardrails-nim-microservices/)
- [NVIDIA Safety Recipe for Agentic AI](https://developer.nvidia.com/blog/safeguard-agentic-ai-systems-with-the-nvidia-safety-recipe/)
- [NVIDIA NeMo Guardrails for Customer Service Agents](https://developer.nvidia.com/blog/how-to-safeguard-ai-agents-for-customer-service-with-nvidia-nemo-guardrails/)
- [Palo Alto Networks + NVIDIA NeMo Integration](https://www.paloaltonetworks.com/blog/network-security/securing-genai-with-ai-runtime-security-and-nvidia-nemo-guardrails/)
- [NVIDIA NeMo Guardrails Colang Guide](https://docs.nvidia.com/nemo/guardrails/latest/configure-rails/colang/index.html)
- [OpenClaw Security Documentation](https://docs.openclaw.ai/gateway/security)
- [OpenClaw Sandboxing Documentation](https://docs.openclaw.ai/gateway/sandboxing)
- [CrowdStrike: What Security Teams Need to Know About OpenClaw](https://www.crowdstrike.com/en-us/blog/what-security-teams-need-to-know-about-openclaw-ai-super-agent/)
- [OpenClaw Security Crisis Analysis (Reco.ai)](https://www.reco.ai/blog/openclaw-the-ai-agent-security-crisis-unfolding-right-now)
- [OpenClaw Security Issues 2026 (Bitrue)](https://www.bitrue.com/blog/openclaw-ai-agent-security-issues-2026)
- [Docker: Run OpenClaw Securely in Docker Sandboxes](https://www.docker.com/blog/run-openclaw-securely-in-docker-sandboxes/)
- [Trend Micro: What OpenClaw Reveals About Agentic Assistants](https://www.trendmicro.com/en_us/research/26/b/what-openclaw-reveals-about-agentic-assistants.html)
- [Cisco AI Defense + NVIDIA NeMo Integration](https://blogs.cisco.com/ai/cisco-ai-defense-integrates-with-nvidia-nemo-guardrails)
