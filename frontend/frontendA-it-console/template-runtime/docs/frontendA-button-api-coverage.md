# Frontend A Button/API Coverage

| Component | Control ID | Action Type | API Endpoint | Fake Handler | Persistence |
| --- | --- | --- | --- | --- | --- |
| MapleTopBar.svelte | topbar-refresh | business | POST /api/ui/refresh | handleUi:/api/ui/refresh | none |
| MapleShell.svelte | chat-home-send | business | POST /api/ui/chat/send | handleUi:/api/ui/chat/send | none |
| WorkspaceViewHost.svelte | chat-prompt-send | business | POST /api/ui/chat/send | handleUi:/api/ui/chat/send | none |
| InterventionControlPanel.svelte | intervention-pause | business | POST /api/ui/intervention/pause | handleUi:/api/ui/intervention/pause | session-durable (execution state) |
| InterventionControlPanel.svelte | intervention-resume | business | POST /api/ui/intervention/resume | handleUi:/api/ui/intervention/resume | session-durable (execution state) |
| InterventionControlPanel.svelte | intervention-stop-confirm | business | POST /api/ui/intervention/cancel | handleUi:/api/ui/intervention/cancel | session-durable (execution state) |
| InterventionControlPanel.svelte | intervention-block-future-action | business | POST /api/ui/intervention/block-rule | handleUi:/api/ui/intervention/block-rule | session-durable (rules) |
| WorkspaceViewHost.svelte | marketplace-filter | business | POST /api/ui/marketplace/dispatch (query applies client-side) | handleUi:/api/ui/marketplace/dispatch | none |
| WorkspaceViewHost.svelte | marketplace-dispatch | business | POST /api/ui/marketplace/dispatch | handleUi:/api/ui/marketplace/dispatch | session-durable (dispatchEvents) |
| WorkspaceViewHost.svelte | firewall-apply-rules | business | POST /api/ui/firewall/rules | handleUi:/api/ui/firewall/rules | session-durable (rules) |
| WorkspaceViewHost.svelte | context-leakage-upload | business | POST /api/ui/firewall/context-leakage/documents | handleUi:/api/ui/firewall/context-leakage/documents | session-durable (leakageUploads) |
| WorkspaceViewHost.svelte | users-add | business | POST /api/ui/users | handleUi:/api/ui/users | session-durable (users) |
| WorkspaceViewHost.svelte | users-save-role | business | PATCH /api/ui/users/:userId/role | handleUi:/api/ui/users/:userId/role | session-durable (users) |
| WorkspaceViewHost.svelte | users-delete | business | DELETE /api/ui/users/:userId | handleUi:/api/ui/users/:userId | session-durable (users) |
| WorkspaceViewHost.svelte | live-zoom-controls | visual-only | - | - | none |
| WorkspaceViewHost.svelte | forks-zoom-controls | visual-only | - | - | none |
| TopologyView.svelte | topology-zoom-controls | visual-only | - | - | none |
