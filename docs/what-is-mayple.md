# What Is Mayple?

## The One-Liner

**Mayple is a real-time firewall for AI agent tool calls.** It sits between AI agents and the tools they use, intercepting every action *before* execution so you can allow, block, or require human approval — with no code changes to your agents.

---

## The Problem It Solves

AI agents are getting more autonomous. They can browse the web, query databases, execute code, send emails, and call APIs. But there's a dangerous gap:

1. **Agents make mistakes.** They can delete production databases, leak PII to external APIs, or post to the wrong Slack channel. Once a tool call executes, the damage is done.

2. **Observability isn't prevention.** Tools like Datadog and LangSmith tell you *what happened after the fact*. They're dashboards, not firewalls. You see the mess, but you can't stop it.

3. **Every vendor has different (or no) controls.** If you use agents from OpenAI, Anthropic, Google, and custom frameworks, each has its own guardrails (or none). There's no unified security baseline.

4. **Security rules are written by engineers.** Your compliance team wants to block agents from sending SSNs externally, but they need to file an engineering ticket and wait for a code deploy. That's a bottleneck.

---

## How Mayple Works

```
Agent --> [Mayple Firewall] --> Tool
               |
    allow / block / require approval
```

1. **Connect your agents** — Point Mayple at any agent (any provider, any framework). It works as an MCP proxy — one layer, zero code changes to agents.

2. **Write rules in plain language** — Ops teams set allow/block/approval policies through a no-code UI. Examples:
   - "Block any tool call that sends SSN to external endpoints"
   - "Require approval before posting to #general"
   - "Allow reads, block writes on production DB"

3. **Intercept in real time** — Every tool call is evaluated against policies before execution. Three possible verdicts: allow, block, or queue for human approval. Sub-2ms decision latency.

4. **Replay, refine, comply** — Full session replay across agents. Immutable audit chains for compliance. Export logs for regulators. Refine rules with real data.

---

## Who It's For

| User | Why They Care |
|------|---------------|
| **Ops / Security teams** | Set agent guardrails without engineering tickets |
| **Compliance teams** | Immutable audit trails, export for regulators |
| **Platform engineers** | Unified control plane across all agent providers |
| **Enterprise risk managers** | Per-user policies, escalation chains, break-glass controls |
| **Platform companies** (Enterprise tier) | Embed Mayple's security kernel into their own agent products via SDK |

---

## What Makes It Different

| Competitor | Their Approach | Mayple's Advantage |
|-----------|----------------|-------------------|
| **Datadog / LangSmith** | Observability — logs what happened *after* | Prevention — blocks risky actions *before* execution |
| **AWS Bedrock AgentCore** | Strong security, but developer-only and AWS-locked | No-code UI, works with any provider |
| **Microsoft Copilot Studio** | Per-environment policies, Microsoft-only | Per-user granular rules, vendor-agnostic |
| **Custom guardrails** | Engineers write code, per-agent | No-code, cross-agent, single pane of glass |

The key differentiators:

- **Prevention-first**, not observability-first
- **Vendor-agnostic** — works across OpenAI, Anthropic, Google, custom
- **No-code policies** — ops teams, not engineers
- **Per-user rules** — not just per-environment
- **MCP-native** — understands the Model Context Protocol natively

---

## The Business Model

| Tier | Price | For |
|------|------:|-----|
| **Pro** | $9/mo | Solo users — firewall, audit log, basic policies |
| **Team** | $15/mo | Teams — human approval queue, per-user rules, RBAC, shared policy library |
| **Enterprise** | $39/mo | Orgs — embeddable SDK, custom policy packs, SSO, compliance reporting |

The real play is **Enterprise SDK embedding**. Platform companies building agent products can embed Mayple as their security layer rather than building a policy engine from scratch. This is the same model that led to $260M+ acquisitions in the infrastructure security space.

---

## Where It Fits in the World

Think of it like this:

- **Firewalls** (Palo Alto, Cloudflare) protect network traffic
- **WAFs** protect web applications
- **Mayple** protects AI agent tool calls

As agents become the primary interface between organizations and their systems, the "agent tool call" becomes the new attack surface — and the new compliance boundary. Mayple bets that every enterprise running AI agents will need a control layer, just like every enterprise running web apps needs a WAF.

The product roadmap shows platform ambitions: multi-tenant org management, RBAC, governance registries, GPT plugin compatibility, desktop app integration. Mayple is building toward being **the control plane for agents** — analogous to what Kubernetes became for containers.

---

## The Worldview

Mayple's thesis is:

> *Agent autonomy is inevitable. Prevention must be automatic. Security policy must be democratized to non-engineers. And the control layer must be vendor-agnostic infrastructure, not a feature of any single AI provider.*

In a world where every company runs dozens of AI agents from multiple providers, Mayple becomes the invisible infrastructure that makes it safe to give agents real power.

---

## Key Features

### Firewall & Policy Engine
- Real-time tool call interception via MCP proxy
- No-code policy rules (allow, block, require approval)
- Per-user granular policies
- Risk scoring and anomaly detection
- SSRF protection, URL reputation checking, content validation

### Human-in-the-Loop (HITL)
- Approval queue for high-risk actions
- SSE live updates for pending approvals
- Escalation chains and break-glass controls
- Step-up authentication for sensitive operations

### Observability & Audit
- Cross-agent trace history (not locked to one provider)
- Immutable audit chains for compliance
- SLO monitoring and alert webhooks
- Dead-letter handling and replay
- Run inventory and execution timeline

### Workspace Surfaces
- **IT Console (Protocol)** — Monitoring, audit, compliance, safeguards for ops teams
- **Desktop App (Catalyst)** — Agent orchestration control plane for engineers
- **Marketing Site (Salient)** — Public-facing marketing and onboarding
- **MCP Widgets** — Embeddable UI components for agent integrations

### Enterprise & Platform
- Multi-tenant organization management
- Role-based access control (RBAC)
- API key and service account lifecycle
- Embeddable SDK for platform companies
- SSO and dedicated environments
- Compliance reporting and export

---

## Architecture at a Glance

```
                    Clients
                       |
                  [Gateway API]  <-- HTTP entry point
                       |
         +-------------+-------------+
         |             |             |
   [Context Wall]  [MCP Proxy]  [Cyber Proxy]
    Policy engine   Tool dispatch   SSRF/malware
         |             |             |
         +------+------+
                |
          [Audit Writer]
           PostgreSQL
```

- **Gateway API** — Public HTTP entry point, orchestrates auth, firewall, billing
- **Context Wall** — Policy engine that evaluates traces and enforces rules (gRPC)
- **MCP Proxy** — Proxies MCP tool execution to downstream apps (gRPC)
- **Cyber Proxy** — SSRF guard, URL reputation, malware scanning (gRPC)
- **Audit Writer** — Immutable audit event persistence (gRPC + PostgreSQL)
- **Business API** — User accounts, billing, org management (Stripe)
- **Tool Runner** — Job execution for OpenClaw modifier and tool runs
