# Frontend A A1 Parity Checklist

This checklist now feeds the broader frontend A security-vision parity program. Visual parity is necessary but not sufficient; the canonical source of truth is `src/lib/maple-workspace/frontendA-parity-spec.js`.

## JSX to Svelte mapping

- MapleWorkspaceShell.jsx -> src/lib/svelte-workspace/MapleShell.svelte
  - Acceptance: top bar + welcome + category pills + sub-tabs + context panel sequence matches a1 cadence and remains route-reachable through canonical `/maple`.
- MapleTopBar.jsx -> src/lib/svelte-workspace/MapleTopBar.svelte
  - Acceptance: connected chrome style and source status badge match a1 hierarchy and preserve security-status framing.
- MapleCategoryRail.jsx -> src/lib/svelte-workspace/MapleCategoryPills.svelte
  - Acceptance: segmented control with animated indicator, active/hover states.
- MapleViewTabs.jsx -> src/lib/svelte-workspace/MapleViewTabs.svelte
  - Acceptance: pill tabs with active gradient, compact geometry, and route-state persistence.
- WorkspaceViewHost.jsx -> src/lib/svelte-workspace/MapleRoutePage.svelte
  - Acceptance: panel body layout, heading contracts, and operator workflow affordances preserved.
- InterventionCommandBar.jsx -> src/lib/svelte-workspace/InterventionControlPanel.svelte
  - Acceptance: traces+sessions left; single target + reason + pause/resume/stop right; filesystem intervention actions remain discoverable.
- MonitoringContextExplainer.jsx -> src/lib/svelte-workspace/MapleRoutePage.svelte (observe/live section)
  - Acceptance: monitoring explainer copy and observability cards visible.
- MapleChatDock.jsx -> src/lib/svelte-workspace/MapleShell.svelte (operator shell framing)
  - Acceptance: center-first chat prompt flow and bottom composer visuals.
- MapleDocsPanel.jsx -> src/lib/svelte-workspace/DocsViews.svelte
  - Acceptance: docs functionality stays in docs pills with overview/api/runbooks/route-help.
- a1 topology + node modal -> src/lib/svelte-workspace/TopologyView.svelte
  - Acceptance: endpoint popup and guard/fork/risk/growth node modal workflow.

## Visual token parity

- judges.css tokens translated into src/styles/mayple-a1-parity.css.
- motion primitives mapped (`--ease-spring`, `--dur-spring`).
- shell/context panel/category/tab/card/modal styles aligned to a1.

## Interaction parity

- Welcome visible on bare /maple.
- category click opens contextual panel and preserves URL state.
- docs tab and runbooks route remain functional.
- intervention actions unchanged contract-wise.
- gateway, cyber, interventions, HITL, agent, audit, and observability remain reachable through the Svelte GUI and are represented in the parity matrix.
