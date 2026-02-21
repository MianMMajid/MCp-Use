# Maple

Unified MCP server for agent observability, safety control, and behavior evolution.

Maple is the "Sentry + Git" layer for high-agency agents:
- Observe every step
- Replay/fork risky branches
- Audit and intervene with guardrails
- Learn from anonymized traces to evolve safer skills

Built with `mcp-use` + Apps SDK widgets.

## What Is Implemented

### 1) Observability + Control
- `observe_session`: capture and render timeline widget
- `replay_fork`: branch from any step and simulate forward
- `audit_risk`: rule + anomaly risk dashboard
- `guard_action`: allow/block/pending with quarantine support
- `ingest_session_event`: stream external bridge events into active trace

### 2) ML Anomaly Detection (Simple Embeddings)
- `ml_anomaly_report`: embedding-based behavior outlier detection
- Lightweight hash embeddings + cosine similarity baseline
- Supports community baseline from anonymized shared traces

### 3) Network Effects
- `share_trace_anon`: anonymize and publish trace patterns to shared pool
- `suggest_evolved_skills`: generate evolved skill suggestions from shared traces
- Behavior signatures + shared dataset create compound data advantage

### 4) YC App Layer (Moat / Traction / Revenue)
- `yc_app_brief`: live YC-ready narrative generated from product metrics
- Emphasizes:
  - Moat: trace + fork + risk label data flywheel
  - Traction: OpenClaw integration and safety intervention activity
  - Revenue: freemium ladder (Free, Pro $9, Team $29, Enterprise $99)

## MCP Tools

- `observe_session`
- `replay_fork`
- `audit_risk`
- `ml_anomaly_report`
- `guard_action`
- `ingest_session_event`
- `share_trace_anon`
- `suggest_evolved_skills`
- `yc_app_brief`
- `list_traces`
- `export_trace`

## API Endpoints

- `GET /health`
- `GET /judge` (judge standalone page)
- `GET /api/traces`
- `GET /api/traces/:traceId`
- `GET /api/community/stats`
- `GET /api/community/traces`
- `GET /api/yc/brief?focus=full|moat|traction|revenue`
- `GET /api/firewall/state`
- `POST /api/firewall/chat`
- `POST /api/firewall/decision` (strict pre-execution allow/block gate)

## Key Project Files

- `index.ts`: tool + route orchestration
- `src/core/risk-engine.ts`: rule engine + embedding anomaly integration
- `src/ml/embeddings.ts`: simple embedding implementation
- `src/ml/anomaly-detector.ts`: cosine-sim anomaly detection
- `src/network/anonymizer.ts`: anonymized trace transformation
- `src/network/shared-trace-store.ts`: community pool + skill suggestions
- `src/strategy/yc-narrative.ts`: moat/traction/revenue narrative builder
- `resources/trace-timeline/widget.tsx`
- `resources/replay-simulator/widget.tsx`
- `resources/risk-dashboard/widget.tsx`

## Quick Start

```bash
npm install
npm run dev
```

Inspector: `http://localhost:3000/inspector`

## Hardcoded Demo Stack (OpenClaw + Maple)

This repo now includes a one-command hardcoded demo setup:

- OpenClaw gateway on `ws://127.0.0.1:19001`
- OpenClaw bridge adapter on `http://127.0.0.1:8787`
- Maple API key generated at startup (or provided via env)
- Bridge token generated at startup (or provided via env)

```bash
OPENCLAW_VERSION=<pin-a-version> npm run demo:install-openclaw
npm run demo:up
```

Then open:

- Judge GUI: `http://localhost:3000/judge`
- Inspector: `http://localhost:3000/inspector`

### Guided Demo Mode (No Manual JSON)

The Judge GUI now has **Guided Demo Controls** so you can run the full flow without Inspector copy/paste:

1. Enter API key and click `Connect`
2. Click `Run Full Flow`

Or step through:

1. `1) Start`
2. `2) Audit`
3. `3) Block`
4. `4) Fork`

Judge page now includes **Firewall Chat** in Control view:
- Ask natural-language questions ("status update", "why blocked?", "what should we do next?")
- Chat replies are generated from live firewall context (`/api/firewall/state`)

This uses internal demo APIs:

- `POST /api/demo/start`
- `POST /api/demo/audit`
- `POST /api/demo/block`
- `POST /api/demo/fork`
- `POST /api/demo/full`

`demo:up` also auto-opens both pages on macOS (set `DEMO_OPEN_BROWSER=0` to disable).

### Single-Trace Agent Action Logging (Hackathon)

For a reliable judge demo, run one stable trace and append every action to it.

```bash
MAPLE_API_KEY=local-demo-key npm run trace:demo
```

What this does:

- Starts (or reuses) one trace for a stable `sessionId`
- Logs all agent actions through `POST /api/openclaw/events` using the same `traceId`
- Includes `type`, `actor`, `prompt/message`, `command`, `url`, `toolName`, and unique `eventId`
- Runs a preflight firewall preview and logs Maple's block/allow message into the same trace

Open `http://localhost:3000/judge`, then select the printed trace ID to see `#0, #1, #2...`.

If you want to integrate this into your own runtime, use:

- `scripts/maple-trace-logger.mjs`
- `logAction(...)` for generic events
- `logWebGet(...)`, `logMarketplaceSearch(...)`, `logMarketplaceToolCall(...)` wrappers

Example:

```js
import { createMapleTraceLogger } from "./scripts/maple-trace-logger.mjs";

const logger = createMapleTraceLogger({
  baseUrl: "http://localhost:3000",
  apiKey: process.env.MAPLE_API_KEY,
  sessionId: "maple-live",
});

await logger.startRun({ reuseLatest: true });
await logger.logAction({
  type: "tool_call",
  actor: "agent",
  toolName: "web_get",
  prompt: "Fetch provider docs",
  url: "https://docs.mcp.so/providers",
});
```

Stop local demo processes:

```bash
npm run demo:down
```

## Environment

```bash
MCP_URL=http://localhost:3000
OPENCLAW_BRIDGE_URL=http://localhost:8787
OPENCLAW_BRIDGE_TOKEN=your_token
MAPLE_API_KEY=your_long_random_key
MAPLE_LOCK_BRIDGE_TARGET=true
```

`observe_session` falls back to mock only when `source=auto`.
For `source=openclaw`, bridge failures are returned as errors (no silent mock downgrade).

### API Key Auth

- Auth methods: `x-api-key: <key>` or `Authorization: Bearer <key>`
- Protected surfaces: MCP endpoints (`/mcp`, `/sse`) and internal APIs (`/api/*`)
- Auth is fail-closed by default. Set `MAPLE_API_KEY` or `MAPLE_API_KEYS`.
- Optional local-only bypass: `MAPLE_ALLOW_NO_AUTH=true` (not recommended).
- `GET /health` remains public for deployment health checks

### Bridge Lockdown (Maple-First Routing)

- Set `MAPLE_LOCK_BRIDGE_TARGET=true` to deny per-request `bridgeUrl` / `token` overrides.
- Bridge override is denied by default.
- Optional local-only override: `MAPLE_ALLOW_BRIDGE_OVERRIDE=true`.
- In production, bridge override lock is enabled automatically.
- In production, `OPENCLAW_BRIDGE_URL` and `OPENCLAW_BRIDGE_TOKEN` must be explicitly set.
- This forces all OpenClaw bridge traffic through configured `OPENCLAW_BRIDGE_URL` + `OPENCLAW_BRIDGE_TOKEN`.
- Override attempts return `403 Bridge override denied`.

### Pre-Execution Firewall Decision API

- `POST /api/firewall/decision` evaluates a candidate action before execution.
- `enforce=true` (default): persist decision into trace and quarantine on deny.
- `enforce=false`: preview mode (no trace mutation), useful for dry-run checks.

### Firewall Status Chat API

- `GET /api/firewall/state` returns normalized live firewall context for a trace/session.
- `POST /api/firewall/chat` answers status questions using that context.
- Body accepts `message`, optional `traceId` / `sessionId`, and `includeContext`.

### Firewall Hardening (mcpwall-inspired)

Maple now enforces deterministic firewall policy checks on every trace step before risk scoring:

- First-match rules for high-risk behavior (`pipe-to-shell`, destructive commands, credential/secret access)
- Secret scanning + in-place redaction with marker: `[REDACTED BY MAPLE]`
- Automatic quarantine (`guardStatus=block`) when deny rules hit
- JSONL firewall audit logs at `~/.maple/firewall-logs/YYYY-MM-DD.jsonl`

Optional environment variables:

```bash
MAPLE_FIREWALL_ENABLED=true
MAPLE_FIREWALL_DEFAULT_ACTION=allow   # allow | deny | log_only
MAPLE_FIREWALL_LOG_DIR=~/.maple/firewall-logs
```

## Demo Script (2-3 min)

1. `observe_session` on an OpenClaw session
2. `audit_risk` to surface risky steps
3. `ml_anomaly_report` to show embedding anomalies
4. `guard_action` block a risky step
5. `replay_fork` from blocked step with safe edits
6. `share_trace_anon` to publish anonymized pattern
7. `suggest_evolved_skills` from community data
8. `yc_app_brief` to show moat/traction/revenue narrative

## Example Calls

```json
{
  "tool": "ml_anomaly_report",
  "input": {
    "traceId": "<trace-id>",
    "useCommunityBaseline": true,
    "threshold": 0.58,
    "topAnomalies": 5
  }
}
```

```json
{
  "tool": "share_trace_anon",
  "input": {
    "traceId": "<trace-id>",
    "taskLabel": "Inbox triage",
    "objective": "Safely automate inbound support triage",
    "tags": ["support", "email", "guarded"]
  }
}
```

```json
{
  "tool": "suggest_evolved_skills",
  "input": {
    "query": "safe inbox triage automation",
    "limit": 3,
    "minConfidence": 0.4
  }
}
```

## Current Limits

- Persistence is in-memory for hackathon speed
- Embedding model is intentionally simple (fast + local)
- No external model provider required

## Deploy

```bash
npm run deploy
```

### Railway Deployment (Recommended)

Yes, Maple can run on Railway with production safeguards.

Use these settings in Railway:

- Build command: `npm run build`
- Start command: `npm run start`
- Health check path: `/health`

Required environment variables:

```bash
NODE_ENV=production
PORT=${{RAILWAY_PORT}}
HOST=0.0.0.0
MCP_URL=https://<your-railway-domain>
MAPLE_API_KEY=<long-random-key>
MAPLE_LOCK_BRIDGE_TARGET=true
OPENCLAW_BRIDGE_URL=<bridge-url-reachable-from-railway>
OPENCLAW_BRIDGE_TOKEN=<bridge-token>
MAPLE_FIREWALL_ENABLED=true
```

Important notes:

- In production, Maple enforces API key auth and requires explicit `OPENCLAW_BRIDGE_URL` + `OPENCLAW_BRIDGE_TOKEN`.
- Do not use `localhost` for `OPENCLAW_BRIDGE_URL` unless the bridge runs in the same container.
- If bridge connectivity is unavailable during demo, use `source=mock` to keep UI + guardrail flow live.
