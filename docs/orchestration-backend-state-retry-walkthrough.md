# Orchestration Backend/State/Retry Walkthrough

This is a code-first walkthrough of where orchestration execution actually lives in this repo, what is only UI state, what is persisted, and who owns retry behavior.

It is meant to answer a concrete question:

- What is frontend-only state?
- What is live backend execution state?
- What is durable database state?
- Where do automatic and manual retries actually happen?
- Which backend surface owns these paths in the repo?

## Short answer

- Backend execution ownership is in `backend/backendB-core-services/gateway-api/service/src/core/orchestration-runtime.js`.
- HTTP ownership is in `backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js` and `backend/backendB-core-services/gateway-api/service/src/routes/orchestration-observability-routes.js`.
- Durable storage ownership is in PostgreSQL schema and helpers under `backend/backendB-core-services/shared/packages/maple-persistence/src/pg-db.js`, plus the snapshot watcher in `orchestration-routes.js`.
- Frontend orchestration state is mostly selection/workspace state and request wrappers, not the execution engine.
- Execution retry semantics are backend-owned.
- Frontend retry logic is transport-owned only: fetch retry, circuit breaker, and SSE reconnect.

## Read this in order

1. `frontend/frontendB-desktop-app/template-runtime/src/lib/orchestrations-api.js`
2. `backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js`
3. `backend/backendB-core-services/gateway-api/service/src/core/orchestration-runtime.js`
4. `backend/backendB-core-services/gateway-api/service/src/routes/orchestration-observability-routes.js`
5. `backend/backendB-core-services/shared/packages/maple-persistence/src/pg-db.js`
6. `frontend/frontendB-desktop-app/template-runtime/src/lib/api.js`
7. `frontend/frontendB-desktop-app/template-runtime/src/lib/stores/chat-store.js`
8. `frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/intervention-api.js`

## End-to-end flow

### 1. Frontend does not execute the graph itself

The desktop frontend wraps orchestration APIs in `frontend/frontendB-desktop-app/template-runtime/src/lib/orchestrations-api.js`.

Important functions:

- `executeOrchestration()`
- `mutateOrchestrationExecution()`
- `retryOrchestrationNode()`
- `replayOrchestrationFromNode()`
- `getOrchestrationExecutionSnapshot()`

Those are thin HTTP wrappers. They do not contain orchestration scheduling logic, node state transitions, or retry policy.

The internal console intervention surface in `frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/intervention-api.js` does the same thing: it posts to backend routes such as:

- `/api/orchestrations/executions/:executionId/pause`
- `/api/orchestrations/executions/:executionId/resume`
- `/api/orchestrations/executions/:executionId/cancel`
- `/api/orchestrations/executions/:executionId/retry-node`
- `/api/orchestrations/executions/:executionId/replay-from-node`

### 2. Execution is created in the gateway route layer

`backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js` owns the execute endpoint:

- `POST /api/orchestrations/:id/execute`

That route:

1. Authenticates and applies the sensitive-operation gate.
2. Loads the orchestration definition/version from the database.
3. Calls `createOrchestrationExecution(...)` from `orchestration-runtime.js`.
4. Creates a DB record with `database.createOrchestrationExecutionRecord(...)`.
5. Starts the persistence watcher with `ensureExecutionPersistenceWatch(...)`.

That means the backend route owns API ingress and persistence hookup, but not the scheduling loop itself.

### 3. Live execution state is runtime-owned and in memory

`backend/backendB-core-services/gateway-api/service/src/core/orchestration-runtime.js` is the actual execution engine.

The important top-level runtime stores are:

- `executionStore = new Map()`
- `executionWatchers = new Map()`
- `agentCache = new Map()`

That file owns:

- graph normalization and validation
- execution creation
- event emission and timelines
- node scheduling
- node execution
- auto-retry behavior
- manual mutations like `retry_node` and `replay_from_node`
- SSE subscriptions via watchers

The clearest ownership markers are:

- `createOrchestrationExecution(...)`
- `processExecutionLoop(...)`
- `runNode(...)`
- `applyMutation(...)`
- `forkOrchestrationExecution(...)`
- `getOrchestrationExecutionSnapshot(...)`

The runtime, not the database, is the active source of truth while an execution is running.

### 4. Persistence is snapshot-based, not scheduler-based

`orchestration-routes.js` also owns persistence synchronization.

The key functions are:

- `persistExecutionSnapshot(executionId)`
- `ensureExecutionPersistenceWatch(executionId)`
- `syncExecutionRecord(execution)`

`ensureExecutionPersistenceWatch(...)` subscribes to runtime events and flushes snapshots to Postgres. That means:

- the runtime emits events into memory
- the route layer watches those events
- the route layer snapshots runtime state into DB tables

The DB is therefore used as:

- durable history
- observability source
- snapshot recovery/read surface

It is not the live scheduler.

### 5. Reads prefer DB for history, but runtime for richer live data

The route layer reads execution state from either source:

- `readExecutionFromDb(...)` / `readExecutionGraphFromDb(...)` / `readExecutionTimelineFromDb(...)`
- fallback or preference to `getOrchestrationExecution(...)`, `getOrchestrationExecutionGraph(...)`, and `getOrchestrationExecutionTimeline(...)`

One especially useful clue is the graph route comment in `orchestration-routes.js`: in-memory graph is preferred because DB persistence does not yet store everything the runtime has, such as attachments.

That is another sign that DB state is a persisted projection, not the richest live object.

## Ownership breakdown

| Concern | Primary owner | Evidence |
| --- | --- | --- |
| Execute/pause/resume/cancel HTTP contract | Gateway route layer | `orchestration-routes.js` |
| Live execution graph and node statuses | Runtime engine | `orchestration-runtime.js` |
| Timeline events | Runtime emits; route layer persists | `emitExecutionEvent(...)`, `persistExecutionSnapshot(...)` |
| Manual graph mutation | Runtime engine via route wrapper | `applyMutation(...)`, `/mutate` route |
| Forking | Observability route + runtime engine | `orchestration-observability-routes.js`, `forkOrchestrationExecution(...)` |
| Durable execution records | Postgres persistence package | `pg-db.js`, `orchestration_executions`, `orchestration_execution_nodes`, `orchestration_timeline_events` |
| UI workspace selections | Frontend store | `chat-store.js` |
| HTTP GET retry / cache / circuit breaker | Frontend transport layer | `frontend/.../lib/api.js` |
| SSE reconnect | Frontend transport layer | `connectSSE(...)` in `frontend/.../lib/api.js` |
| Execution retry semantics | Backend runtime | `runNode(...)`, `applyMutation(...)` |

## State ownership, specifically

### Frontend-owned state

`frontend/frontendB-desktop-app/template-runtime/src/lib/stores/chat-store.js` owns local UI/workspace state such as:

- current mode
- selected orchestration
- selected execution id
- selected panel tab
- local storage hydration
- query-string sync

This is workspace state, not execution state.

It does not determine:

- whether a node is runnable
- whether a node should retry
- whether the graph is complete or failed
- whether a replay should reset downstream nodes

### Backend runtime-owned state

`orchestration-runtime.js` owns:

- execution status: `queued`, `running`, `paused`, `waiting_approval`, `completed`, `failed`, `canceled`
- per-node status
- `retryCount`
- `maxRetries`
- run ids / lineage
- execution timeline
- approvals
- mutations
- runtime graph version

This is the state that drives the scheduler.

### DB-owned durable state

`pg-db.js` defines the durable tables:

- `orchestration_executions`
- `orchestration_execution_nodes`
- `orchestration_execution_edges`
- `orchestration_mutations`
- `orchestration_timeline_events`
- `orchestration_conversations`
- `orchestration_objective_packages`
- `orchestration_execution_tasks`
- `orchestration_execution_reassignments`

This is persistence and readback state.

### Important caveat

The current code does not rehydrate `executionStore` from Postgres on startup.

What the code clearly does:

- creates live executions into `executionStore`
- snapshots them into Postgres
- reads historical snapshots back from Postgres

What it does not clearly do:

- load saved executions back into `executionStore`
- resume the execution loop from database state after process restart

So the current model is best described as:

- live runtime in memory
- durable projection in Postgres
- historical inspection from Postgres

not:

- database-driven workflow engine

## Retry ownership, specifically

### 1. Automatic node retry is backend-owned

`runNode(...)` in `orchestration-runtime.js` handles automatic retry on node failure.

Behavior:

1. Node execution throws.
2. Runtime checks `node.retryCount < node.maxRetries`.
3. If retry budget remains:
   - increments `retryCount`
   - resets node back to `pending`
   - emits `node_retrying`
4. The main execution loop will pick that node up again later.
5. If retry budget is exhausted:
   - node becomes `failed`
   - execution becomes `failed`

This is not frontend behavior and not DB behavior. It is runtime behavior.

### 2. Manual `retry-node` is backend-owned mutation logic

`POST /api/orchestrations/executions/:executionId/retry-node` in `orchestration-routes.js` calls:

- `mutateOrchestrationExecution(executionId, { op: "retry_node", nodeId })`

`applyMutation(...)` in `orchestration-runtime.js` handles `retry_node` by:

- setting node status back to `pending`
- clearing `error`
- clearing `completedAt`

Important nuance: `retry_node` does not explicitly restart a terminal execution loop. It is a node-state mutation, not a full relaunch primitive.

### 3. Manual `replay-from-node` is also backend-owned, and stronger

`POST /api/orchestrations/executions/:executionId/replay-from-node` in `orchestration-routes.js` also calls backend mutation logic, but with `op: "replay_from_node"`.

`applyMutation(...)` handles `replay_from_node` by:

- finding the target node and all downstream nodes
- resetting their status, error, run id, output preview, and attachments
- if the execution is terminal, setting status back to running and calling `queueExecutionStart(...)`

This is the real relaunch-from-here primitive.

### 4. Fork is separate from retry/replay

`POST /api/observability/orchestrations/executions/:executionId/fork` in `orchestration-observability-routes.js` calls `forkOrchestrationExecution(...)`.

That flow:

- clones the parent graph
- applies edit operations to the fork
- creates a brand-new execution id
- creates a DB execution record for the fork
- starts a persistence watch for the fork

That is not a retry. It is a new execution lineage.

### 5. Frontend retry is transport-only

`frontend/frontendB-desktop-app/template-runtime/src/lib/api.js` contains:

- GET retry with backoff in `withRetry(...)`
- circuit breaker logic
- SSE reconnect logic in `connectSSE(...)`

This retry layer is about network/service availability.

It does not change orchestration node state.

Also note:

- `postJson(...)` is not automatically retried by default
- orchestration mutation endpoints are explicit operator actions, not implicit frontend retries

So if someone says "retry is frontend-owned", that is only true for transport resilience, not for orchestration semantics.

## Sidecar state: tasks and reassignments

There is another layer in `orchestration-routes.js`:

- `executionTasks = new Map()`
- `executionReassignments = new Map()`

These are operational overlays for task/reassignment views and are persisted into:

- `orchestration_execution_tasks`
- `orchestration_execution_reassignments`

They are useful state, but they are not the orchestration scheduler itself.

In other words:

- graph execution ownership is in `orchestration-runtime.js`
- task board / reassignment ownership is route-layer sidecar state

## Repo/code ownership

If "ownership" means code ownership in the repo, the relevant files are explicitly assigned.

`service-catalog.yaml`:

- `gateway-api` owner: `backendB-core`
- `context-wall` owner: `backendB-core`
- `mcp-proxy` owner: `backendB-core`
- `audit-writer` owner: `backendB-core`

`CODEOWNERS`:

- `/backend/ @omar2001ramadan`
- `/backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js @omar2001ramadan @MianMMajid`
- `/backend/backendB-core-services/gateway-api/service/src/routes/orchestration-observability-routes.js @omar2001ramadan @MianMMajid`
- `/backend/backendB-core-services/gateway-api/service/src/routes/orchestration-operations-routes.js @omar2001ramadan @MianMMajid`

`backend/README.md` and `COLLABORATION_STRUCTURE.md` also describe the backend/frontend boundary at the repo level.

## Inspect-it-yourself commands

Use these from repo root.

```bash
rg -n "createOrchestrationExecution|processExecutionLoop|runNode|node_retrying|retry_node|replay_from_node|forkOrchestrationExecution" \
  backend/backendB-core-services/gateway-api/service/src/core/orchestration-runtime.js
```

```bash
rg -n "/execute|/pause|/resume|/cancel|/mutate|/retry-node|/replay-from-node|ensureExecutionPersistenceWatch|persistExecutionSnapshot" \
  backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js
```

```bash
rg -n "/fork|forkOrchestrationExecution|ensureExecutionPersistenceWatch" \
  backend/backendB-core-services/gateway-api/service/src/routes/orchestration-observability-routes.js
```

```bash
rg -n "orchestration_executions|orchestration_execution_nodes|orchestration_timeline_events|orchestration_execution_tasks|orchestration_execution_reassignments" \
  backend/backendB-core-services/shared/packages/maple-persistence/src/pg-db.js
```

```bash
rg -n "executeOrchestration|retryOrchestrationNode|replayOrchestrationFromNode|mutateOrchestrationExecution" \
  frontend/frontendB-desktop-app/template-runtime/src/lib/orchestrations-api.js
```

```bash
rg -n "withRetry|connectSSE|postJson|circuit" \
  frontend/frontendB-desktop-app/template-runtime/src/lib/api.js
```

```bash
rg -n "mode|stackMode|selectedOrchestrationId|orchestrationExecutionId|localStorage" \
  frontend/frontendB-desktop-app/template-runtime/src/lib/stores/chat-store.js
```

## Test evidence

Two frontend e2e specs are useful for confirming the control-plane split:

- `tests/frontend/e2e/orchestration-control-plane.frontendB.spec.ts`
- `tests/frontend/e2e/orchestration-observability.frontendA.spec.ts`

What they prove:

- frontend orchestration controls call backend APIs like `/execute`, `/pause`, `/resume`, `/cancel`, and `/mutate`
- frontend observability/intervention views consume backend observability endpoints instead of reimplementing execution logic locally

They do not prove runtime recovery semantics after restart, but they do confirm the frontend/backend API boundary.

## Bottom line

If you need one sentence:

The frontend owns workspace state and transport resilience, but the backend owns orchestration execution state and retry semantics, with Postgres acting as a persisted snapshot/history layer rather than the live execution engine.
