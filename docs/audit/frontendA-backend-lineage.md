# Frontend A Backend Lineage

Generated: 2026-03-05T15:41:00.507Z

| bff_endpoint | ownership | persistence_class | downstream_count | missing_downstream |
| --- | --- | --- | --- | --- |
| GET /api/ui/bootstrap | gateway+grpc(audit-writer) | not-persisted | 14 | 0 |
| GET /api/ui/analysts | gateway+grpc(audit-writer) | not-persisted | 3 | 0 |
| GET /api/ui/users | gateway+db | durable-db | 3 | 0 |
| POST /api/ui/users | gateway+db | durable-db | 1 | 0 |
| PATCH /api/ui/users/:userId/role | gateway+db | durable-db | 2 | 0 |
| DELETE /api/ui/users/:userId | gateway+db | durable-db | 1 | 0 |
| GET /api/ui/firewall/rules | gateway+db | durable-db | 2 | 0 |
| POST /api/ui/firewall/rules | gateway+db | durable-db | 1 | 0 |
| PATCH /api/ui/firewall/rules/:ruleId | gateway+db | durable-db | 1 | 0 |
| DELETE /api/ui/firewall/rules/:ruleId | gateway+db | durable-db | 1 | 0 |
| GET /api/ui/firewall/context-leakage/documents | gateway-only | durable-db | 1 | 0 |
| POST /api/ui/firewall/context-leakage/documents | gateway-only | durable-db | 1 | 0 |
| POST /api/ui/marketplace/dispatch | gateway+db | ephemeral | 1 | 0 |
| POST /api/ui/chat/send | gateway+grpc(context-wall) | not-persisted | 2 | 0 |
| POST /api/ui/intervention/pause | gateway+db | ephemeral | 1 | 0 |
| POST /api/ui/intervention/resume | gateway+db | ephemeral | 1 | 0 |
| POST /api/ui/intervention/cancel | gateway+db | ephemeral | 2 | 0 |
| POST /api/ui/intervention/block-rule | gateway+db | ephemeral | 1 | 0 |
| POST /api/ui/refresh | gateway-only | not-persisted | 0 | 0 |
