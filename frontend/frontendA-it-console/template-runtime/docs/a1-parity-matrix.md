# Mayple A1 Parity Matrix (`/maple`)

## Reference Source
- Reference clone: `/Users/omarramadan/Desktop/mcp_firewall_a1_reference`
- Reference files:
  - `public/judges.html`
  - `public/judges.css`
  - `public/judges.js`

## Canonical product target

- Shipping target: `src/routes/maple/+layout.svelte`
- Shell and GUI host: `src/lib/svelte-workspace/MapleLayoutShell.svelte`
- Capability parity source of truth: `src/lib/maple-workspace/frontendA-parity-spec.js`
- Canonical route metadata: `src/lib/maple-workspace/route-registry.js`

`public/judges.*` is legacy intake only. It is no longer the ship target for frontend A.

## 1:1 Feature Mapping
- Welcome state + quick prompt pills: implemented in `MapleLayoutShell.svelte` (`welcome-state`, `welcome-pill`).
- Category pill bar and top navigation: implemented in `MapleLayoutShell.svelte`, `MapleTopBar.svelte`, and `MapleViewTabs.svelte`.
- Context panel transitions + sub-tabs: implemented in `MapleLayoutShell.svelte` (`context-panel`, `context-sub-tab`).
- Chat-first composer + runtime advisory flow: implemented in the Maple shell chat surface and firewall APIs (`/api/firewall/chat`, `/api/chat/stream`).
- Action tree decision surface: implemented in `MapleRoutePage` (`ActionTreePanel`, `tree-node`).
- Node action modal: implemented in `MapleRoutePage` (`NodeActionModal`, guard/fork/risk/growth sections).
- Topology view + endpoint cards: implemented in `MapleRoutePage` (`topology-view`).
- Control inventory with trace selection: implemented in `MapleRoutePage` (`TraceInventory`).
- Intervention command bar for stop/intervene operations: existing component retained and embedded in observe/analyze/govern/admin views.
- Contextual docs drawer + dedicated `Docs` category tabs: retained via `DocsViews.svelte` and route-scoped docs surfaces in `MapleRoutePage.svelte`.

## Data Boundary Mapping
- Frontend A still monitors mediated execution streams from the downstream runtime perspectives it supervises.
- Route, GUI, backend, and CLI parity for security workflows is tracked in `frontendA-parity-spec.js`, not only in visual notes.
- Svelte GUI surfaces are parity-critical when they affect discoverability, review context, or operator actions.

## URL + Compatibility Mapping
- Canonical URL remains `/maple` with `category`, `view`, `route`, optional `executionId`, `sessionId`.
- Legacy `/maple/*` paths continue deep-link mapping through existing workspace state resolver.
- Headings preserved:
  - `Observability & Alerts`
  - `Audit & Compliance Operations`
