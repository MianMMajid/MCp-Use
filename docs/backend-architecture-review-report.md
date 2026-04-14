# Backend Architecture Review Report

Status: current-code snapshot for senior backend review.

Audience: senior backend engineer reviewing service boundaries, state ownership, runtime behavior, reliability posture, and architectural risk in the current backend implementation.

Scope: active backend control-plane surfaces in this repo, with emphasis on `backend/backendB-core-services` and the gateway-led runtime path. This is not a product overview.

## Executive summary

The backend is best understood as an edge control-plane monolith fronting a small internal service mesh.

The primary runtime entrypoint is the gateway API. The gateway owns:

- HTTP/API ingress
- route registration across many domains
- orchestration API contracts
- auth/session entry
- trace and runtime surfaces
- bootstrap of workers and OpenClaw runtime

The internal service mesh provides specialized enforcement and durability functions:

- `context-wall`: policy evaluation and model/provider-backed firewall reasoning
- `mcp-proxy`: downstream tool dispatch with scoped credentials and cyber checks
- `cyber-proxy`: SSRF/content scanning plane
- `audit-writer`: append-only audit persistence with batch/dead-letter behavior

PostgreSQL is the shared persistence substrate for orchestration records, traces, shared traces, generated assets, user/org data, and other control-plane metadata.

The architecture is strong on policy enforcement layering and audit separation, but it currently mixes three state models:

- live runtime state in process memory
- persisted snapshots/projections in PostgreSQL
- route-layer operational overlays in additional in-memory maps

That hybrid model is workable, but it creates clear review targets around restart behavior, persistence consistency, and dependency posture.

## System model

### Active topology

High-level path:

```text
Clients / UI / agents
        |
        v
  Gateway API (HTTP edge + route composition + orchestration API)
        |
        +--> Context Wall (policy / HITL / provider routing)
        |         |
        |         +--> MCP Proxy
        |         |       |
        |         |       +--> Cyber Proxy
        |         |       +--> Audit Writer
        |         |
        |         +--> Audit Writer
        |
        +--> Audit Writer
        |
        +--> PostgreSQL
```

Primary code entrypoints:

- `backend/backendB-core-services/gateway-api/service/src/app.js`
- `backend/backendB-core-services/gateway-api/service/src/routes/register-routes.js`
- `backend/backendB-core-services/context-wall/service/src/service.js`
- `backend/backendB-core-services/mcp-proxy/service/src/service.js`
- `backend/backendB-core-services/audit-writer/service/src/service.js`
- `backend/backendB-core-services/audit-writer/service/src/store.js`

Service ownership and lifecycle metadata:

- `service-catalog.yaml`
- `CODEOWNERS`
- `backend/README.md`

### Service lifecycle posture

Based on `service-catalog.yaml`, the active core services are centered in `backendB-core`.

Important lifecycle notes:

- `gateway-api`: active, edge tier
- `context-wall`: active, policy tier
- `mcp-proxy`: active, execution tier
- `audit-writer`: active
- `tool-runner`: retired, replaced by inlined execution in `mcp-proxy`
- `model-router`: retired, replaced by local provider routing in `context-wall`
- `admin-console-api`: retired, functionality merged into gateway routes

Architecturally, this means service count has been reduced, but the gateway has absorbed a broader composition role.

## Runtime composition

### Gateway API

The gateway is the central coordinator.

Key files:

- `backend/backendB-core-services/gateway-api/service/src/app.js`
- `backend/backendB-core-services/gateway-api/service/src/state.js`
- `backend/backendB-core-services/gateway-api/service/src/grpc-clients.js`
- `backend/backendB-core-services/gateway-api/service/src/routes/register-routes.js`

Observed behavior:

- gRPC clients are created for internal services in `grpc-clients.js`
- startup dependency checks are enforced via `core/runtime-dependencies.js`
- route registration is split between explicit route registration and side-effect imports
- database initialization is attempted during boot
- OpenClaw runtime and background workers are bootstrapped from the gateway process

Current architectural reading:

- the gateway is not a thin API layer
- it is the edge runtime shell for most backend capabilities

### Route composition model

`register-routes.js` composes the gateway using two patterns:

1. explicit registration calls such as `registerOrchestrationRoutes(app)`
2. side-effect route modules loaded through `SIDE_EFFECT_ROUTE_MODULES`

This is an important review point because it affects:

- startup determinism
- route discoverability
- testing granularity
- module ownership clarity

The current model works, but it is not purely explicit composition.

### Internal RPC and resilience

`grpc-clients.js` adds:

- pooled secure gRPC clients
- service-name annotation
- service-level circuit breakers
- per-call service utilization recording

This is a good internal abstraction boundary and a clear architectural strength.

## Service responsibilities

### Context Wall

Code: `backend/backendB-core-services/context-wall/service/src/service.js`

Responsibilities visible in code:

- firewall step evaluation
- prompt injection and PII handling through shared security packages
- filesystem mutation planning and policy
- model/provider routing using OpenAI/Anthropic provider modules
- downstream dispatch into `mcp-proxy`
- audit emission into `audit-writer`

Current architectural role:

- policy decision engine
- approval/control brain
- provider-routing replacement for the retired model-router

### MCP Proxy

Code: `backend/backendB-core-services/mcp-proxy/service/src/service.js`

Responsibilities visible in code:

- downstream MCP tool execution
- HMAC-signed scoped credential minting/verification
- cyber-proxy integration
- audit emission
- inlined replacement for the retired tool-runner service

Current architectural role:

- hardened execution plane behind policy approval

### Audit Writer

Code:

- `backend/backendB-core-services/audit-writer/service/src/service.js`
- `backend/backendB-core-services/audit-writer/service/src/store.js`

Responsibilities visible in code:

- gRPC append/query streaming surface
- in-memory recent-event cache
- PostgreSQL batch persistence
- write buffering
- dead-letter fallback
- periodic DLQ pruning

Current architectural role:

- durability and audit isolation plane

Tradeoff visible in code:

- it is optimized for throughput and resilience, not strict synchronous durability on every caller path

## State and persistence model

### Shared persistent substrate

Primary schema location:

- `backend/backendB-core-services/shared/packages/maple-persistence/src/pg-db.js`

Relevant persisted backend entities include:

- orchestrations
- orchestration versions
- orchestration executions
- orchestration execution nodes
- orchestration execution edges
- orchestration mutations
- orchestration timeline events
- orchestration conversations
- orchestration objective packages
- orchestration execution tasks
- orchestration execution reassignments
- traces
- shared traces
- generated assets

### Orchestration state is hybrid, not single-source

This is the most important architectural detail for review.

Live orchestration execution is owned by:

- `backend/backendB-core-services/gateway-api/service/src/core/orchestration-runtime.js`

The runtime keeps active execution state in process memory:

- `executionStore`
- `executionWatchers`
- runtime graph state
- retry counters
- timeline
- approvals
- mutations

Durable orchestration history is written through:

- `persistExecutionSnapshot(...)`
- `ensureExecutionPersistenceWatch(...)`
- `syncExecutionRecord(...)`

in:

- `backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js`

This means current orchestration architecture is:

- live scheduler in memory
- DB as persisted projection/history
- APIs reading from DB or runtime depending on availability and richness

It is not a database-driven workflow engine.

### Sidecar operational state

The route layer also maintains additional in-memory maps:

- `conversations`
- `objectivePackages`
- `executionTasks`
- `executionReassignments`

These are partially persisted, but they are not part of the core orchestration runtime object model.

That creates a second state layer around the runtime.

## Execution and retry model

### Runtime execution loop

The orchestration engine in `orchestration-runtime.js` owns:

- graph validation
- execution creation
- node readiness checks
- node dispatch
- success/failure transitions
- automatic retry
- manual mutation application
- fork creation

Critical functions:

- `createOrchestrationExecution(...)`
- `processExecutionLoop(...)`
- `runNode(...)`
- `applyMutation(...)`
- `forkOrchestrationExecution(...)`

### Retry semantics

There are three distinct retry/restart behaviors:

1. automatic node retry in `runNode(...)`
2. explicit `retry_node` mutation
3. explicit `replay_from_node` mutation

Important distinction:

- `retry_node` resets a node back to pending
- `replay_from_node` resets the node and all downstream nodes, and can relaunch a terminal execution
- fork creates a new execution lineage

This separation is good and should be preserved.

### Frontend retry is not orchestration retry

Frontend transport retry exists in:

- `frontend/frontendB-desktop-app/template-runtime/src/lib/api.js`

That includes:

- GET retry with backoff
- circuit breaker
- SSE reconnect

It is transport resilience only. It is not the owner of orchestration retry semantics.

## Reliability and failure handling

### Positive patterns

Observed resilience patterns:

- gRPC circuit breakers in gateway/context-wall/mcp-proxy
- audit-writer buffered batch insert with dead-letter fallback
- dependency-report and capability checks in `core/runtime-dependencies.js`
- explicit fork vs replay semantics
- historical reads from DB even when runtime instance is not the original writer

### Dependency posture

There is a meaningful architectural inconsistency here.

`backend/README.md` states:

- PostgreSQL is required in runtime
- runtime behavior is fail-closed

`state.js` also contains:

- `assertGatewayStartupPolicy()` with comment indicating fail-closed persistence posture

But `app.js` currently does this:

- attempts DB initialization
- logs a warning on failure
- continues serving stateless routes
- starts workers with `database: null` when DB is unavailable

That means documented posture and actual gateway startup behavior are not fully aligned.

For a senior backend review, this needs to be resolved as a product-level and platform-level decision, not left implicit.

### Audit durability posture

Audit handling is intentionally not identical across call sites.

Examples:

- `audit-writer` uses `synchronous_commit=off` in the PG pool config
- `mcp-proxy` audit emission is fire-and-forget
- `context-wall` audit emission may be non-blocking outside stricter paths

This may be acceptable, but only if the audit durability contract is explicitly defined.

Otherwise the code and the architecture narrative can drift apart.

## Security and tenancy

### Good signs

Visible positive controls:

- HMAC-signed scoped credential flow in `mcp-proxy`
- route lock and downstream routing policy in gateway state/config
- verified tenant scope usage in orchestration observability/operations routes
- filesystem mutation policy living in context-wall/shared security
- SSRF and content scanning delegated to cyber-proxy

### Review angle

The orchestration-specific routes show recent hardening toward verified tenant scope and step-up gates.

A senior review should confirm this posture is consistent across:

- route modules loaded through side effects
- older admin/ops routes
- downstream tool-control surfaces

## Architectural findings

These are the main review findings from the current code shape.

### High: orchestration runtime is not restart-resilient

Evidence:

- live executions are stored in `executionStore` in memory
- API reads can fall back to DB snapshots
- there is no visible code path that reloads DB execution snapshots back into the live runtime loop

Impact:

- active executions are process-local
- gateway restart likely loses runnable execution state, even if snapshots remain inspectable

Review question:

- is orchestration intended to be ephemeral control state, or should it be resumable after process restart?

### High: startup dependency posture is internally inconsistent

Evidence:

- `backend/README.md` says fail-closed with required PostgreSQL
- `state.js` comments imply strict startup policy
- `app.js` explicitly allows degraded startup when DB init fails

Impact:

- operators and engineers cannot rely on a single mental model for backend availability guarantees

Review question:

- should the gateway be strictly fail-closed on DB dependency failure, or officially support degraded stateless mode?

### High: orchestration snapshot persistence is non-transactional

Evidence:

- `persistExecutionSnapshot(...)` updates execution record, deletes node/edge rows, reinserts node rows, reinserts edge rows, upserts mutations, inserts timeline events
- this work is not wrapped in a database transaction

Impact:

- partial projections are possible if the process dies or a query fails mid-snapshot
- DB views can temporarily reflect incomplete runtime state

Review question:

- should snapshot flush be transactional, versioned, or redesigned to avoid destructive replace cycles?

### Medium: route registration still relies on side-effect imports

Evidence:

- `SIDE_EFFECT_ROUTE_MODULES` in `register-routes.js`

Impact:

- harder route discoverability
- implicit startup order
- weaker module encapsulation

Review question:

- is the current route composition model intentional, or should the codebase move to explicit registration everywhere?

### Medium: audit durability guarantees are mixed and should be made explicit

Evidence:

- buffered async writes
- `synchronous_commit=off`
- fire-and-forget emission in some service paths

Impact:

- architecture may claim stronger audit guarantees than the current implementation delivers under failure

Review question:

- what exact audit SLO and durability guarantees are required for this control plane?

### Medium: route-layer sidecar state is split from runtime state

Evidence:

- `conversations`, `objectivePackages`, `executionTasks`, and `executionReassignments` live in route-level maps
- persistence is present but best-effort in multiple paths

Impact:

- orchestration runtime state and operator/task state are not unified
- more than one place owns execution-adjacent state

Review question:

- should these operational overlays be promoted into first-class runtime/persistence abstractions?

## Strengths

The current backend also has clear strengths.

- Service roles are reasonably well separated between policy, execution, audit, and edge coordination.
- gRPC client wrapping with circuit breakers and service telemetry is solid.
- The tool-runner and model-router retirements simplified the service graph.
- Fork, replay, and retry are distinct concepts in the orchestration model.
- Audit-writer has a concrete DLQ path instead of silently dropping failures.
- Verified tenant-scope enforcement is visible in sensitive orchestration control routes.

## Recommended review agenda

If a senior backend engineer is reviewing this system, the highest-value review sequence is:

1. Decide the intended truth model for orchestration state.
   Current state suggests in-memory live execution plus DB projection. Confirm if that is intentional.

2. Decide the gateway dependency contract.
   The code currently supports degraded DB startup while some docs imply fail-closed.

3. Review persistence consistency boundaries.
   `persistExecutionSnapshot(...)` should be examined for transactionality and projection guarantees.

4. Review audit durability as a formal contract.
   The code makes throughput/durability tradeoffs that should be documented and accepted explicitly.

5. Review route/module composition.
   Side-effect route loading is functional but increases mental overhead and risk of hidden coupling.

## Inspection map

Start here:

- `backend/backendB-core-services/gateway-api/service/src/app.js`
- `backend/backendB-core-services/gateway-api/service/src/routes/register-routes.js`
- `backend/backendB-core-services/gateway-api/service/src/core/orchestration-runtime.js`
- `backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js`
- `backend/backendB-core-services/gateway-api/service/src/routes/orchestration-observability-routes.js`
- `backend/backendB-core-services/gateway-api/service/src/core/runtime-dependencies.js`
- `backend/backendB-core-services/gateway-api/service/src/grpc-clients.js`
- `backend/backendB-core-services/context-wall/service/src/service.js`
- `backend/backendB-core-services/mcp-proxy/service/src/service.js`
- `backend/backendB-core-services/audit-writer/service/src/service.js`
- `backend/backendB-core-services/audit-writer/service/src/store.js`
- `backend/backendB-core-services/shared/packages/maple-persistence/src/pg-db.js`
- `service-catalog.yaml`
- `CODEOWNERS`
- `backend/README.md`

## Bottom line

The backend is a control-plane-first architecture with a strong gateway and useful internal service separation, but the most important design decision is still unsettled in implementation terms: whether orchestration is intended to be an in-memory runtime with durable projections, or a resumable durable workflow system. Most of the review risk follows from that one boundary.
