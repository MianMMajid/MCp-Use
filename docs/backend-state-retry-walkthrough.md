# Backend, State, and Retry Ownership Walkthrough

This is the walkthrough to hand someone when they need to prove, in code, where orchestration ownership actually lives in this repo.

It is intentionally inspection-first. Every claim below points to concrete files that can be opened locally.

## What This Walkthrough Should Prove

- Backend ownership: orchestration execution is owned by the gateway backend, not by either frontend.
- State ownership: active execution state lives in the orchestration runtime in memory, with database snapshots and query tables used for persistence and inspection.
- Retry ownership: node retry behavior is implemented in the backend state machine; frontend retry buttons only invoke backend routes.
- Transport resilience is separate from orchestration retry semantics.

## Repo Ownership Boundary

Start here for the repo-level contract:

- `COLLABORATION_STRUCTURE.md`
- Backend runtime code lives under `backend/backendB-core-services/*` and `backend/backendC-saas-services/*`.
- Frontend surfaces live under `frontend/frontendA-it-console/*` and `frontend/frontendB-desktop-app/*`.

That boundary matters because the retry/state logic discussed here does not live in frontend stores or route components.

## The Fast Answer

- The execution state machine is in `backend/backendB-core-services/gateway-api/service/src/core/orchestration-runtime.js`.
- The HTTP control surface for execute, pause, resume, cancel, retry, replay, snapshot, and stream is in `backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js`.
- Persistent execution records, node rows, edge rows, mutation rows, and timeline rows are defined in `backend/backendB-core-services/shared/packages/maple-persistence/src/pg-db.js`.
- Frontend B calls those routes through `frontend/frontendB-desktop-app/template-runtime/src/lib/orchestrations-api.js` and mirrors the returned snapshot in `frontend/frontendB-desktop-app/template-runtime/src/contexts/chat-context.jsx`.
- Frontend A calls the same backend routes through `frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/intervention-api.js`.

## Walkthrough Order

### 1. Start at the gateway routes

Open:

- `backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js`

Inspect these entry points:

- `POST /api/orchestrations/:id/execute`
- `POST /api/orchestrations/executions/:executionId/pause`
- `POST /api/orchestrations/executions/:executionId/resume`
- `POST /api/orchestrations/executions/:executionId/cancel`
- `POST /api/orchestrations/executions/:executionId/retry-node`
- `POST /api/orchestrations/executions/:executionId/replay-from-node`
- `GET /api/orchestrations/executions/:executionId/snapshot`
- `GET /api/orchestrations/executions/:executionId/stream`

What this shows:

- The gateway is the backend control plane for execution lifecycle.
- `retry-node` is a thin wrapper around `mutateOrchestrationExecution(..., { op: "retry_node" })`.
- `replay-from-node` is a distinct backend operation with broader state reset semantics.
- Snapshot and stream endpoints are backend-owned inspection surfaces.

### 2. Follow the route into the runtime state machine

Open:

- `backend/backendB-core-services/gateway-api/service/src/core/orchestration-runtime.js`

Inspect these functions in order:

- `createOrchestrationExecution()`
- `processExecutionLoop()`
- `runNode()`
- `applyMutation()`
- `getOrchestrationExecutionSnapshot()`

What this shows:

- `executionStore` is the active in-memory registry for live executions.
- `createOrchestrationExecution()` constructs the runtime graph, execution metadata, and initial timeline.
- `processExecutionLoop()` is the scheduler that decides which pending node can run next.
- `runNode()` owns node status transitions: `pending -> running -> succeeded/failed`, and automatic retry behavior.
- `applyMutation()` owns operator-driven mutations like `retry_node`, `replay_from_node`, `spawn_agent`, and graph rewires.

## State Ownership in Plain Terms

### Active state owner

The active source of truth for a running execution is the gateway runtime:

- `executionStore` holds the live execution object.
- `execution.timeline` holds the live event stream.
- `execution.graph.nodes[*]` holds live node status, retry count, output preview, and error state.

This means:

- While an execution is running, the backend runtime owns the authoritative state transitions.
- The frontends do not derive or reconcile execution state themselves.

### Persistent state owner

The backend also persists execution state for inspection and history:

- `orchestration_executions`
- `orchestration_execution_nodes`
- `orchestration_execution_edges`
- `orchestration_mutations`
- `orchestration_timeline_events`

Inspect the schema in:

- `backend/backendB-core-services/shared/packages/maple-persistence/src/pg-db.js`

Inspect the snapshot writer in:

- `backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js`

Specifically:

- `persistExecutionSnapshot()`
- `ensureExecutionPersistenceWatch()`
- `syncExecutionRecord()`

What this shows:

- The backend writes snapshot state out of the runtime into database tables.
- The backend read APIs can serve from memory or from the database, depending on what is available.
- The database is the persisted inspection surface, not the scheduler.

### Important current limitation

This codebase does not currently rehydrate active executions back into `executionStore` on process boot.

What to inspect:

- There is `readExecutionFromDb()` and `readExecutionGraphFromDb()` in `orchestration-routes.js`.
- There is no complementary boot-time loader that reconstructs live runtime execution objects into `executionStore`.

So the current model is:

- Live execution control: in-memory backend runtime.
- Historical visibility and post-write inspection: database snapshot tables.

## Retry Ownership

There are three different retry concepts here. They should not be mixed together.

### 1. Automatic node retry in the backend runtime

Inspect:

- `runNode()` in `backend/backendB-core-services/gateway-api/service/src/core/orchestration-runtime.js`

What happens:

- A node throws.
- If `node.retryCount < node.maxRetries`, the backend increments `retryCount`, sets status back to `pending`, stores the error, emits `node_retrying`, and leaves the scheduler to pick the node back up.
- If retries are exhausted, the backend marks the node `failed` and the execution fails.

Ownership conclusion:

- Automatic retry semantics are backend-owned and implemented inside the execution state machine.

### 2. Manual operator retry

Inspect:

- `POST /api/orchestrations/executions/:executionId/retry-node` in `orchestration-routes.js`
- `applyMutation(... op: "retry_node")` in `orchestration-runtime.js`

What happens:

- The frontend sends `nodeId`.
- The backend mutation resets that node to `pending`, clears the node error, and emits a mutation event.
- The backend scheduler then decides when that node runs again.

Ownership conclusion:

- Manual retry is still backend-owned; the frontend only requests it.

### 3. Replay from a node

Inspect:

- `POST /api/orchestrations/executions/:executionId/replay-from-node`
- `applyMutation(... op: "replay_from_node")`

What happens:

- The backend walks downstream edges from the selected node.
- It resets that node and all reachable descendants.
- If the execution had already reached a terminal state, the backend reopens it and restarts processing.

Ownership conclusion:

- Replay is a stronger backend state reset than retry.
- This is why `replay_from_node` is treated differently from `retry_node`.

## Frontend Ownership

### Frontend B

Open:

- `frontend/frontendB-desktop-app/template-runtime/src/lib/orchestrations-api.js`
- `frontend/frontendB-desktop-app/template-runtime/src/contexts/chat-context.jsx`
- `frontend/frontendB-desktop-app/template-runtime/src/lib/api.js`

Inspect:

- `retryOrchestrationNode()`
- `replayOrchestrationFromNode()`
- `loadOrchestrationExecutionSnapshot()`
- `retryExecutionNode()`

What this shows:

- Frontend B does not implement retry logic itself.
- It calls backend routes, then reloads the backend snapshot.
- The local React state is a mirror of backend execution state for rendering.

### Frontend A

Open:

- `frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/intervention-api.js`

Inspect:

- `interventionActionCatalog().retryNode`
- `interventionActionCatalog().replayNode`

What this shows:

- Frontend A also delegates retry/replay to the same backend routes.
- It is a second control surface over the same backend-owned execution state.

## Transport Retry Is Not Execution Retry

Open:

- `frontend/frontendB-desktop-app/template-runtime/src/lib/api.js`
- `frontend/frontendB-desktop-app/template-runtime/src/routes/(app)/orchestrate/[id]/+page.svelte`

Inspect:

- `withRetry()` in `src/lib/api.js`
- `connectSSE()` in `src/lib/api.js`
- `connectExecutionStream()` in `+page.svelte`

What this shows:

- Frontend request retry and SSE reconnect are transport resilience features.
- They retry fetches or reconnect event streams.
- They do not mutate orchestration node state or increment node retry counts.

Ownership conclusion:

- Backend retry changes execution semantics.
- Frontend retry only protects the UI against transient transport failures.

## Persistence and Inspection Path

If someone claims they understand the backend/state ownership, have them walk this path end to end:

1. Show `POST /api/orchestrations/:id/execute`.
2. Show `createOrchestrationExecution()`.
3. Show where the execution is placed into `executionStore`.
4. Show `processExecutionLoop()` and `runNode()`.
5. Show automatic retry inside `runNode()`.
6. Show manual retry through `retry-node -> mutateOrchestrationExecution -> applyMutation`.
7. Show `ensureExecutionPersistenceWatch()` and `persistExecutionSnapshot()`.
8. Show the database tables in `pg-db.js`.
9. Show `GET /api/orchestrations/executions/:executionId/snapshot`.
10. Show a frontend adapter reloading that snapshot.

If they cannot walk that sequence in code, they do not yet own the architecture being described.

## Commands To Inspect Locally

```bash
rg -n "createOrchestrationExecution|processExecutionLoop|runNode|applyMutation|getOrchestrationExecutionSnapshot" \
  backend/backendB-core-services/gateway-api/service/src/core/orchestration-runtime.js

rg -n "retry-node|replay-from-node|snapshot|stream|ensureExecutionPersistenceWatch|persistExecutionSnapshot" \
  backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js

rg -n "orchestration_executions|orchestration_execution_nodes|orchestration_mutations|orchestration_timeline_events" \
  backend/backendB-core-services/shared/packages/maple-persistence/src/pg-db.js

rg -n "retryOrchestrationNode|loadOrchestrationExecutionSnapshot|retryExecutionNode" \
  frontend/frontendB-desktop-app/template-runtime/src/lib/orchestrations-api.js \
  frontend/frontendB-desktop-app/template-runtime/src/contexts/chat-context.jsx

rg -n "retryNode|replayNode" \
  frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/intervention-api.js
```

## Review Questions

Use these to verify that the walkthrough is grounded in the code:

1. Where is the live execution object stored while a run is active?
2. Which function decides whether a failed node is retried automatically?
3. What is the difference between `retry_node` and `replay_from_node` in the runtime?
4. Which backend function writes node status and retry counts into Postgres?
5. Which frontend files trigger retry, and what do they do after the POST returns?
6. What happens to active executions if the gateway process restarts?

Expected answers:

- Live execution state is in `executionStore`.
- Automatic retry is in `runNode()`.
- `retry_node` resets one node to `pending`; `replay_from_node` resets that node and downstream nodes and can restart a terminal execution.
- Snapshot persistence is handled by `persistExecutionSnapshot()`.
- Frontends call the backend routes and reload snapshots; they do not own the state machine.
- The current code persists history to the database but does not rehydrate active execution control state into memory on boot.
