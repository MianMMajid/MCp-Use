# MCP Firewall Analysis + Maple Integration

## Source Reviewed
- Repo: `https://github.com/behrensd/mcp-firewall`
- Local snapshots used:
  - `./mcp-firewall-reference` (inside Maple root)
  - `../mcp-firewall` (workspace-level clone)
- Key files reviewed:
  - `src/engine/policy.ts`
  - `src/engine/outbound-policy.ts`
  - `src/engine/secrets.ts`
  - `src/logger.ts`
  - `rules/default.yml`

## What mcp-firewall does well
1. Deterministic first-match policy evaluation.
2. Strong deny defaults for known high-risk patterns (pipe-to-shell, credential paths, destructive shell).
3. Deep secret scanning + redaction with entropy checks.
4. JSONL audit logs for all enforcement decisions.
5. Bidirectional thinking (inbound request filtering + outbound response scanning).

## Gaps vs Maple architecture
Maple is not a stdio MCP proxy process. It is an MCP server + observability plane with traces and guardrail APIs. So integration must happen at the trace lifecycle level, not as a transport proxy.

## Concepts merged into Maple
Implemented in `src/security/firewall-policy.ts` and wired through `index.ts`:

1. **Deterministic firewall rule engine**
- Top-to-bottom, first-match semantics.
- Rule actions: `allow`, `deny`, `log_only`.
- Default action configurable via env.

2. **High-risk deny rules**
- SSH key access
- `.env` and credential file access
- destructive shell patterns
- pipe-to-shell
- reverse-shell patterns
- secret/API key leakage

3. **Secret detection and redaction**
- Deep object scanning across prompt/output/command/tool payloads.
- Redaction marker: `[REDACTED BY MAPLE]`.
- Includes entropy-gated generic secret detection.

4. **Automatic intervention**
- Deny action sets `guardStatus=block`.
- Trace gets quarantined (`status=quarantined`).
- Firewall risk flags injected as `firewall_*` and preserved in risk engine.

5. **Audit logging**
- JSONL logs written to `~/.maple/firewall-logs/YYYY-MM-DD.jsonl`.
- Includes trace/session/step/action/rule/redaction metadata.

## Deliberate differences from mcp-firewall
1. No external YAML config yet; Maple uses code-defined defaults + env controls.
2. No separate stdio proxy process.
3. Outbound redaction is applied by sanitizing stored trace step content so all downstream APIs/UI inherit safe content.

## Env controls
- `MAPLE_FIREWALL_ENABLED=true|false`
- `MAPLE_FIREWALL_DEFAULT_ACTION=allow|deny|log_only`
- `MAPLE_FIREWALL_LOG_DIR=~/.maple/firewall-logs`
