# Frontend A Fake Mode Parity

## Fake-mode runtime verification

| scenario | method | path | status | evidence_class |
| --- | --- | --- | --- | --- |
| bootstrap | GET | /api/ui/bootstrap | 200 | runtime-proven-fake |
| analysts | GET | /api/ui/analysts | 200 | runtime-proven-fake |
| users:list | GET | /api/ui/users | 200 | runtime-proven-fake |
| users:create | POST | /api/ui/users | 200 | runtime-proven-fake |
| firewall-rules:list | GET | /api/ui/firewall/rules | 200 | runtime-proven-fake |
| firewall-rules:create | POST | /api/ui/firewall/rules | 201 | runtime-proven-fake |
| marketplace:dispatch | POST | /api/ui/marketplace/dispatch | 200 | runtime-proven-fake |
| chat:send | POST | /api/ui/chat/send | 200 | runtime-proven-fake |
| intervention:pause | POST | /api/ui/intervention/pause | 200 | runtime-proven-fake |
| intervention:resume | POST | /api/ui/intervention/resume | 200 | runtime-proven-fake |
| intervention:cancel | POST | /api/ui/intervention/cancel | 200 | runtime-proven-fake |
| intervention:block-rule | POST | /api/ui/intervention/block-rule | 200 | runtime-proven-fake |
| refresh | POST | /api/ui/refresh | 200 | runtime-proven-fake |

## Real-mode probe

| scenario | method | path | status | evidence_class |
| --- | --- | --- | --- | --- |
| health | GET | /health | 200 | runtime-proven-real |
| ui-bootstrap | GET | /api/ui/bootstrap | 200 | runtime-proven-real |
| ui-analysts | GET | /api/ui/analysts | 200 | runtime-proven-real |
| ui-users | GET | /api/ui/users | 200 | runtime-proven-real |
