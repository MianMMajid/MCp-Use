# Frontend B Dataflow DB + Stream Coverage

Generated: 2026-03-05T15:48:46.423Z

- Domains audited: 6
- Fully durable domains: 6
- Gaps: none

| Domain | API Read | API Write | DB Durable | Stream Durable | Verdict |
| --- | --- | --- | --- | --- | --- |
| orchestration_conversation | yes | yes | yes | no | PASS |
| orchestration_execution_tasks_reassignments | yes | yes | yes | yes | PASS |
| openclaw_sessions_runs_events | yes | yes | yes | yes | PASS |
| firewalls_objects | yes | yes | yes | no | PASS |
| skills_custom_activity | yes | yes | yes | no | PASS |
| chat_transcripts_stream_events | yes | yes | yes | yes | PASS |

