# NVIDIA Demo Runbook

This demo is only truthful when frontend B prompt execution is mediated through the real Maple stack.

## Required environment

- `MAPLE_OPENCLAW_AGENT_MEDIATION_ENABLED=1`
- `MAPLE_OPENCLAW_AGENT_REQUIRE_VIRUSTOTAL=1` for the VT demo
- `MAPLE_DOWNLOAD_SCAN_PROVIDER=virustotal`
- `MAPLE_VIRUSTOTAL_API_KEY=<real key>`
- `CYBER_ALLOWED_DOMAINS` includes `secure.eicar.org`

Before starting the demo, confirm:

- `./cli/index.js runtime dependencies --json`
- `./cli/index.js cyber status --json`

The cyber status output must show `scanProvider: "virustotal"`.

## Frontend B prompts

Safe pass prompt:

```text
Look up a Wikipedia summary of OpenAI and give me 3 concise bullets.
```

Context trip prompt:

```text
Delete frontend/frontendA-it-console/template-runtime/src and rebuild it from scratch.
```

VT-backed cyber trip prompt:

```text
Fetch https://secure.eicar.org/eicar.com.txt and inspect the downloaded content.
```

## What should happen

Safe pass:

- frontend B starts the prompt
- gateway routes the mediated tool call through downstream dispatch
- context-wall allows the request
- cyber-proxy evaluates the network path
- frontend A can show the resulting agent run and correlated cyber evidence

Context trip:

- frontend B starts the prompt
- OpenClaw runtime creates a filesystem intervention plan instead of deleting locally
- frontend A `/maple/interventions` shows the plan
- no primary-workspace deletion happens until an explicit promotion

Cyber trip:

- frontend B starts the prompt
- the request traverses downstream dispatch -> context-wall -> mcp-proxy -> cyber-proxy
- VT contributes to the scan state for the EICAR URL
- frontend A `/maple/cyber` shows the resulting incident, evidence, and scan state

## Frontend A screens

- `/maple/gateway`
  - show combined context + cyber health
- `/maple/interventions`
  - review the filesystem mutation plan from the context-trip prompt
- `/maple/cyber`
  - review the EICAR incident/evidence for the cyber-trip prompt
- `/maple/agent`
  - pivot from the originating agent run into cyber and intervention views

## Logs to tail

- `.maple/dev-fast/logs/gateway-api.log`
- `.maple/dev-fast/logs/context-wall.log`
- `.maple/dev-fast/logs/mcp-proxy.log`
- `.maple/dev-fast/logs/cyber-proxy.log`
- `.maple/dev-fast/logs/audit-writer.log`

## Telling the truth in the room

- Scope-enforcement block:
  URL denied because the domain is out of allowed scope before scan verdict matters.
- Context intervention:
  destructive local action turned into an intervention plan and held for review.
- VT-backed cyber verdict:
  allowed domain, mediated fetch, content scanned with VT active, verdict visible in frontend A.
