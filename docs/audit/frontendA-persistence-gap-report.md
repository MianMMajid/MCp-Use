# Frontend A Persistence Gap Report

Known DB tables in MaplePostgresDatabase: agents, audit_events, chat_conversations, chat_messages, chat_stream_events, firewall_object_snippets, firewall_objects, firewall_policy_revisions, gateway_audit_outbox, gateway_modifier_approvals, gateway_modifier_org_members, gateway_modifier_tenant_policies, notification_preferences, notifications, openclaw_run_artifacts, openclaw_runs, openclaw_session_events, openclaw_sessions, orchestration_conversation_messages, orchestration_execution_edges, orchestration_execution_nodes, orchestration_execution_reassignments, orchestration_execution_tasks, orchestration_executions, orchestration_mutations, orchestration_timeline_events, orchestration_versions, orchestrations, sessions, shared_traces, skills_activity, skills_custom, subscriptions, tasks, traces, user_integrations, users

| endpoint | persistence_class | backing_tables_guess |
| --- | --- | --- |
| GET /api/ui/bootstrap | not-persisted | - |
| GET /api/ui/analysts | not-persisted | - |
| GET /api/ui/users | durable-db | users, sessions |
| POST /api/ui/users | durable-db | users, sessions |
| PATCH /api/ui/users/:userId/role | durable-db | users, sessions |
| DELETE /api/ui/users/:userId | durable-db | users, sessions |
| GET /api/ui/firewall/rules | durable-db | users, sessions |
| POST /api/ui/firewall/rules | durable-db | users, sessions |
| PATCH /api/ui/firewall/rules/:ruleId | durable-db | users, sessions |
| DELETE /api/ui/firewall/rules/:ruleId | durable-db | users, sessions |
| GET /api/ui/firewall/context-leakage/documents | durable-db | users, sessions |
| POST /api/ui/firewall/context-leakage/documents | durable-db | users, sessions |
| POST /api/ui/marketplace/dispatch | ephemeral | - |
| POST /api/ui/chat/send | not-persisted | - |
| POST /api/ui/intervention/pause | ephemeral | - |
| POST /api/ui/intervention/resume | ephemeral | - |
| POST /api/ui/intervention/cancel | ephemeral | - |
| POST /api/ui/intervention/block-rule | ephemeral | - |
| POST /api/ui/refresh | not-persisted | - |
