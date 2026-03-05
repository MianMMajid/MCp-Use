# Frontend A Button/API Coverage

Generated: 2026-03-05T15:41:00.507Z

| control_id | component | action_type | api_support | expected_api |
| --- | --- | --- | --- | --- |
| fakedatacontrol-busy-seeding-generate-fake-data | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/FakeDataControl.svelte | visual-only | n/a | - |
| fakedatacontrol-use-real-api | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/FakeDataControl.svelte | visual-only | n/a | - |
| interventioncontrolpanel-execution-executionid-execution-sessionid-session-n-a | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/InterventionControlPanel.svelte | business-query | n/a | - |
| interventioncontrolpanel-pause | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/InterventionControlPanel.svelte | business-action | yes | POST /api/ui/intervention/pause |
| interventioncontrolpanel-resume | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/InterventionControlPanel.svelte | business-action | yes | POST /api/ui/intervention/resume |
| interventioncontrolpanel-stop | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/InterventionControlPanel.svelte | navigation | n/a | - |
| interventioncontrolpanel-block-future-action | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/InterventionControlPanel.svelte | business-action | yes | POST /api/ui/intervention/block-rule |
| interventioncontrolpanel-confirm | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/InterventionControlPanel.svelte | business-action | yes | POST /api/ui/intervention/cancel |
| interventioncontrolpanel-cancel | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/InterventionControlPanel.svelte | navigation | n/a | - |
| mapleshell-prompt | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/MapleShell.svelte | business-query | n/a | - |
| mapleshell-send | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/MapleShell.svelte | business-action | yes | POST /api/ui/chat/send |
| mapleshell-yes-send | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/MapleShell.svelte | navigation | n/a | - |
| mapleshell-no | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/MapleShell.svelte | navigation | n/a | - |
| mapleshell-submit-5 | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/MapleShell.svelte | business-action | yes | POST /api/ui/chat/send |
| mapletopbar-global-all-analysts | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/MapleTopBar.svelte | business-query | n/a | - |
| mapletopbar-refresh | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/MapleTopBar.svelte | business-action | yes | POST /api/ui/refresh |
| topologyview | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/TopologyView.svelte | visual-only | n/a | - |
| topologyview-reset | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/TopologyView.svelte | visual-only | n/a | - |
| topologyview | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/TopologyView.svelte | visual-only | n/a | - |
| topologyview-rightnodes-0-title-rightnodes-0-subtitle | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/TopologyView.svelte | business-query | n/a | - |
| topologyview-rightnodes-1-title-rightnodes-0-title-rightnodes-1-subtitle-rightnodes-0-subtitle | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/TopologyView.svelte | business-query | n/a | - |
| workspaceviewhost | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | visual-only | n/a | - |
| workspaceviewhost-reset | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | visual-only | n/a | - |
| workspaceviewhost | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | visual-only | n/a | - |
| workspaceviewhost-node-title-node-command-node-risk | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-query | n/a | - |
| workspaceviewhost-prompt | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-action | yes | POST /api/ui/chat/send |
| workspaceviewhost-chatbusy-sending-send | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-action | yes | POST /api/ui/chat/send |
| workspaceviewhost-filter | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-query | n/a | - |
| workspaceviewhost-dispatch | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-action | yes | POST /api/ui/marketplace/dispatch |
| workspaceviewhost-firewallrulesbusy-applying-apply-rules | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-action | yes | POST /api/ui/firewall/rules |
| workspaceviewhost | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | visual-only | n/a | - |
| workspaceviewhost-reset | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | visual-only | n/a | - |
| workspaceviewhost | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | visual-only | n/a | - |
| workspaceviewhost-node-title-node-command-node-risk | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-query | n/a | - |
| workspaceviewhost-node-title-node-command-node-risk | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-query | n/a | - |
| workspaceviewhost-add-user | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-action | yes | POST /api/ui/users |
| workspaceviewhost-save-role | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-action | yes | PATCH /api/ui/users/:userId/role |
| workspaceviewhost-delete | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-action | yes | DELETE /api/ui/users/:userId |
| workspaceviewhost-submit-18 | frontend/frontendA-it-console/template-runtime/src/lib/svelte-workspace/WorkspaceViewHost.svelte | business-action | yes | POST /api/ui/chat/send |
| page-loading-signing-in-sign-in | frontend/frontendA-it-console/template-runtime/src/routes/login/+page.svelte | business-action | yes | POST /api/auth/login |
| page-sign-in-with-google | frontend/frontendA-it-console/template-runtime/src/routes/login/+page.svelte | business-action | yes | POST /api/auth/google |
| +page-submit-3 | frontend/frontendA-it-console/template-runtime/src/routes/login/+page.svelte | business-action | yes | POST /api/auth/login |
