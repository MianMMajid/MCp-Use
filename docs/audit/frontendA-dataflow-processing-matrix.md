# Frontend A Dataflow + Dataprocessing Matrix

| panel | frontend_source | transformations | backend_pipeline | durability |
| --- | --- | --- | --- | --- |
| workspace-bootstrap | /api/ui/bootstrap | B-origin filtering, fallback behavior in fake mode, derived topology endpoint projection | BFF composition -> gateway observability/orchestration/integration routes -> mixed db+grpc | read-model (mixed durable+ephemeral) |
| analyst-filter-source | /api/ui/analysts | dedupe/sort analyst identifiers, client-side filtering across panels | BFF composed from audit/executions/approvals/auth | read-model |
| timeline-live-topology-forks | /api/ui/bootstrap.auditEvents + executions | risk/status normalization, host extraction, node derivation | gateway observability + orchestration queries | audit: durable-db/outbox; execution state: mixed |
| intervention-command-bar | /api/ui/intervention/* | target resolution (execution/session), reason gate for destructive actions | BFF -> orchestration/openclaw routes | ephemeral control-state mutations |
| users-crud | /api/ui/users* | row normalization id/userId/name/email/role/status/source | BFF -> org members/invites/roles routes | durable-db |
| firewall-rules-library | /api/ui/firewall/rules* | rule normalization condition/decision/status/source | BFF -> firewall routes | ephemeral in gateway/fake-durable-localstorage |
| context-leakage-documents | POST /api/ui/firewall/context-leakage/documents | file metadata extraction + policy mode tagging | BFF -> firewall upload route | not-persisted in real path; fake-localstorage in fake mode |
| marketplace-dispatch | POST /api/ui/marketplace/dispatch | dispatch payload mapping app/tool/source | BFF -> downstream dispatch route | ephemeral (fake-localstorage dispatch history) |
| monitoring-chat | POST /api/ui/chat/send | primary + fallback adapter extraction | BFF -> firewall chat -> stream fallback | not-persisted conversation history |
