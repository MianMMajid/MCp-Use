# Mayple A1 Parity Matrix (`/maple`)

## Reference Source
- Reference clone: `/Users/omarramadan/Desktop/mcp_firewall_a1_reference`
- Reference files:
  - `public/judges.html`
  - `public/judges.css`
  - `public/judges.js`

## 1:1 Feature Mapping
- Welcome state + quick prompt pills: implemented in `MapleWorkspaceShell` (`welcome-state`, `welcome-pill`).
- Category pill bar (`Observe`, `Analyze`, `Govern`, `Admin`, `Docs`): implemented in `MapleWorkspaceShell` (`category-pill`).
- Context panel transitions + sub-tabs: implemented in `MapleWorkspaceShell` (`context-panel`, `context-sub-tab`).
- Chat-first composer + runtime advisory flow: implemented in `MapleChatDock` (`chat-composer-home`, `/api/firewall/chat`, `/api/chat/stream`).
- Action tree decision surface: implemented in `WorkspaceViewHost` (`ActionTreePanel`, `tree-node`).
- Node action modal: implemented in `WorkspaceViewHost` (`NodeActionModal`, guard/fork/risk/growth sections).
- Topology view + endpoint cards: implemented in `WorkspaceViewHost` (`topology-view`).
- Control inventory with trace selection: implemented in `WorkspaceViewHost` (`TraceInventory`).
- Intervention command bar for stop/intervene operations: existing component retained and embedded in observe/analyze/govern/admin views.
- Contextual docs drawer + dedicated `Docs` category tabs: retained via `MapleDocsPanel` and docs views in `WorkspaceViewHost`.

## Data Boundary Mapping
- Monitoring feeds are filtered through `filterFrontendBOrigin`.
- Target badge and context text explicitly call out `Frontend B orchestration runtime`.
- Non-B-origin records are excluded in runtime datasets and monitoring summaries.

## URL + Compatibility Mapping
- Canonical URL remains `/maple` with `category`, `view`, `route`, optional `executionId`, `sessionId`.
- Legacy `/maple/*` paths continue deep-link mapping through existing workspace state resolver.
- Headings preserved:
  - `Observability & Alerts`
  - `Audit & Compliance Operations`
