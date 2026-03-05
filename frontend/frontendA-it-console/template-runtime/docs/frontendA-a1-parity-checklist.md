# Frontend A A1 Parity Checklist

## JSX to Svelte mapping

- MapleWorkspaceShell.jsx -> src/lib/svelte-workspace/MapleShell.svelte
  - Acceptance: top bar + welcome + category pills + sub-tabs + context panel sequence matches a1 cadence.
- MapleTopBar.jsx -> src/lib/svelte-workspace/MapleTopBar.svelte
  - Acceptance: connected chrome style and source status badge match a1 hierarchy.
- MapleCategoryRail.jsx -> src/lib/svelte-workspace/MapleCategoryPills.svelte
  - Acceptance: segmented control with animated indicator, active/hover states.
- MapleViewTabs.jsx -> src/lib/svelte-workspace/MapleViewTabs.svelte
  - Acceptance: pill tabs with active gradient and compact geometry.
- WorkspaceViewHost.jsx -> src/lib/svelte-workspace/WorkspaceViewHost.svelte
  - Acceptance: panel body layout and heading contracts preserved.
- InterventionCommandBar.jsx -> src/lib/svelte-workspace/InterventionControlPanel.svelte
  - Acceptance: traces+sessions left; single target + reason + pause/resume/stop right.
- MonitoringContextExplainer.jsx -> src/lib/svelte-workspace/WorkspaceViewHost.svelte (observe/live section)
  - Acceptance: monitoring explainer copy and observability cards visible.
- MapleChatDock.jsx -> src/lib/svelte-workspace/MapleShell.svelte (composer area)
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
