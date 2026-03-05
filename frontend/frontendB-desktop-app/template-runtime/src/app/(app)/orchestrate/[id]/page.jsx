'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import clsx from 'clsx'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Select } from '@/components/select'
import { useOrchestration } from '@/components/orchestration/use-orchestration'
import { AgentNode } from '@/components/orchestration/agent-node'
import { DelegationEdge } from '@/components/orchestration/delegation-edge'
import { CanvasToolbar } from '@/components/orchestration/canvas-toolbar'
import { AgentPalette } from '@/components/orchestration/agent-palette'
import { NodeConfigPanel } from '@/components/orchestration/node-config-panel'
import { EdgeConfigPanel } from '@/components/orchestration/edge-config-panel'
import { formatDate, statusColor } from '@/lib/format'
import { DevicePhoneMobileIcon, ShareIcon } from '@heroicons/react/24/outline'

const nodeTypes = { agentNode: AgentNode }
const edgeTypes = { delegationEdge: DelegationEdge }
const defaultEdgeOptions = { type: 'delegationEdge' }
const reactFlowDisabled = process.env.NEXT_PUBLIC_DISABLE_REACTFLOW === '1'

function shortId(value) {
  if (!value) return '--'
  const text = String(value)
  return text.length <= 14 ? text : text.slice(0, 14)
}

function RuntimeMobileCanvas({ execution, loopState, runtimeGraph, timeline }) {
  const runtimeNodes = Array.isArray(runtimeGraph?.nodes) ? runtimeGraph.nodes : []
  const recentTimeline = Array.isArray(timeline) ? timeline.slice(-24).reverse() : []

  return (
    <div className="flex h-full items-center justify-center bg-[var(--mayple-bg)] px-6 py-5">
      <div className="w-full max-w-[460px] rounded-[36px] border border-zinc-300 bg-zinc-950 p-3 shadow-2xl dark:border-zinc-700">
        <div className="h-full max-h-[86dvh] min-h-[520px] overflow-hidden rounded-[28px] bg-zinc-100 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <DevicePhoneMobileIcon className="h-4 w-4 text-zinc-400" />
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Runtime Canvas</p>
              <Badge color={statusColor(execution?.status || 'unknown')} className="text-[10px]">
                {execution?.status || 'idle'}
              </Badge>
            </div>
            {loopState ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                phase {loopState.phase || 'plan'} · iteration {loopState.iteration || 0}
              </p>
            ) : null}
          </div>

          <div className="grid h-[calc(100%-60px)] grid-rows-[auto,1fr]">
            <div className="border-b border-zinc-200/80 px-4 py-2 dark:border-zinc-800">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Runtime Nodes
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {runtimeNodes.length === 0 ? (
                  <span className="text-xs text-zinc-400">No runtime nodes yet.</span>
                ) : (
                  runtimeNodes.slice(0, 12).map((node) => (
                    <span key={node.id} className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-800">
                      {node.id}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="overflow-y-auto px-3 py-2">
              {recentTimeline.length === 0 ? (
                <p className="px-1 py-3 text-xs text-zinc-400">No runtime events yet.</p>
              ) : (
                recentTimeline.map((event, index) => (
                  <div key={event.id || `${event.eventType}-${index}`} className="mb-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
                    <div className="flex items-center gap-2">
                      <Badge color={statusColor(event.eventType || 'unknown')} className="text-[10px]">
                        {event.eventType || 'event'}
                      </Badge>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {formatDate(event.timestamp)}
                      </span>
                    </div>
                    {event.nodeId ? (
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">node: {event.nodeId}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BuilderTasksPanel({
  orchestrationName,
  executionHistory,
  currentExecutionId,
  setCurrentExecutionId,
  onLoadExecutionSnapshot,
  tasks,
  reassignments,
  runtimeBusyAction,
  runtimeError,
  loopState,
  onStartLive,
  onStartDry,
  onPause,
  onResume,
  onCancel,
}) {
  const busy = Boolean(runtimeBusyAction)

  async function handleExecutionChange(event) {
    const executionId = String(event.target.value || '')
    setCurrentExecutionId(executionId)
    if (executionId) {
      await onLoadExecutionSnapshot(executionId).catch(() => {})
    }
  }

  return (
    <aside className="flex w-[21rem] shrink-0 flex-col border-r border-zinc-200/80 bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="border-b border-zinc-200/80 px-3 py-3 dark:border-zinc-800">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Tasks</p>
        <p className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-300">{orchestrationName || 'Untitled orchestration'}</p>
        <Select value={currentExecutionId || ''} onChange={handleExecutionChange} className="mt-2 w-full">
          <option value="">Select execution</option>
          {executionHistory.map((item) => {
            const id = String(item.executionId || item.id || '')
            return (
              <option key={id} value={id}>
                {shortId(id)} · {item.status || 'unknown'}
              </option>
            )
          })}
        </Select>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button color="orange" disabled={busy} onClick={() => onStartLive().catch(() => {})}>Start Live</Button>
          <Button outline disabled={busy} onClick={() => onStartDry().catch(() => {})}>Dry Run</Button>
          <Button outline disabled={busy || !currentExecutionId} onClick={() => onPause().catch(() => {})}>Pause</Button>
          <Button outline disabled={busy || !currentExecutionId} onClick={() => onResume().catch(() => {})}>Resume</Button>
          <Button color="red" disabled={busy || !currentExecutionId} onClick={() => onCancel().catch(() => {})} className="col-span-2">Cancel</Button>
        </div>

        {loopState ? (
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            loop {loopState.phase || 'plan'} · iteration {loopState.iteration || 0}
          </p>
        ) : null}
        {runtimeError ? (
          <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {runtimeError}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Task List</p>
        <div className="mt-2 space-y-2">
          {tasks.length === 0 ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              No tasks for this execution.
            </p>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="flex items-center gap-2">
                  <p className="flex-1 truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{task.title || task.id}</p>
                  <Badge color={statusColor(task.status || 'unknown')} className="text-[10px]">
                    {task.status || 'unknown'}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  owner agent: {task.ownerAgentId || '--'}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  owner role: {task.ownerRole || '--'}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  orchestration: {orchestrationName || '--'}
                </p>
              </div>
            ))
          )}
        </div>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Reassignment Queue</p>
        <div className="mt-2 space-y-2">
          {reassignments.length === 0 ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              No scheduled reassignments.
            </p>
          ) : (
            reassignments.map((item) => (
              <div key={item.reassignmentId || item.id} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  task {shortId(item.taskId)}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  due {formatDate(item.dueAt)}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  target {item.targetAgentId || item.targetRole || '--'}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}

function CanvasInner() {
  const { id } = useParams()
  const [canvasTab, setCanvasTab] = useState('designer')
  const {
    orchestration,
    loading,
    saving,
    dirty,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    selectedNode,
    selectedEdge,
    addAgentNode,
    removeNode,
    onConnect,
    removeEdge,
    updateEdgePolicy,
    updateName,
    updateStatus,
    saveNow,
    scheduleSave,
    executionHistory,
    currentExecutionId,
    setCurrentExecutionId,
    execution,
    runtimeGraph,
    timeline,
    runtimeBusyAction,
    runtimeMessage,
    runtimeError,
    loopState,
    tasks,
    reassignments,
    publishVersion,
    executeVersion,
    pauseExecution,
    resumeExecution,
    cancelExecution,
    loadExecutionSnapshot,
  } = useOrchestration(id)

  const reactFlowWrapper = useRef(null)

  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes)
    const hasMoved = changes.some((change) => change.type === 'position' && change.dragging === false)
    if (hasMoved) scheduleSave()
  }, [onNodesChange, scheduleSave])

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
  }, [setSelectedNodeId, setSelectedEdgeId])

  const onEdgeClick = useCallback((_event, edge) => {
    setSelectedEdgeId(edge.id)
    setSelectedNodeId(null)
  }, [setSelectedEdgeId, setSelectedNodeId])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [setSelectedNodeId, setSelectedEdgeId])

  const onDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event) => {
    event.preventDefault()
    const agentId = event.dataTransfer.getData('application/orchestration-agent')
    if (!agentId) return

    const bounds = reactFlowWrapper.current?.getBoundingClientRect()
    const position = {
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
    }

    addAgentNode(agentId, position)
  }, [addAgentNode])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) return
        if (selectedNodeId) { removeNode(selectedNodeId); return }
        if (selectedEdgeId) { removeEdge(selectedEdgeId); return }
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        saveNow()
      }
      if (event.key === 'Escape') {
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedEdgeId, removeNode, removeEdge, saveNow, setSelectedNodeId, setSelectedEdgeId])

  useEffect(() => {
    const handler = (event) => {
      if (dirty) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <CanvasToolbar
          orchestration={null}
          saving={false}
          dirty={false}
          onSave={() => {}}
          onUpdateName={() => {}}
          onUpdateStatus={() => {}}
          onPublishVersion={() => {}}
          onExecuteVersion={() => {}}
          runtimeBusyAction=""
        />
        <div className="flex flex-1 items-center justify-center bg-[var(--mayple-bg)]">
          <div className="flex flex-col items-center gap-3">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            <span className="text-sm text-zinc-500">Loading orchestration...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <CanvasToolbar
        orchestration={orchestration}
        saving={saving}
        dirty={dirty}
        onSave={saveNow}
        onUpdateName={updateName}
        onUpdateStatus={updateStatus}
        onPublishVersion={publishVersion}
        onExecuteVersion={executeVersion}
        runtimeBusyAction={runtimeBusyAction}
      />

      <div className="flex items-center gap-2 border-b border-zinc-200/80 bg-white/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/80">
        {[
          ['designer', 'Designer'],
          ['runtime', 'Runtime'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setCanvasTab(value)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              canvasTab === value
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
            )}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Badge color={statusColor(execution?.status || 'unknown')} className="text-[10px]">
            {execution?.status || 'idle'}
          </Badge>
          {runtimeMessage ? <span className="text-xs text-zinc-500 dark:text-zinc-400">{runtimeMessage}</span> : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--mayple-bg)]">
        <AgentPalette nodes={nodes} />

        <BuilderTasksPanel
          orchestrationName={orchestration?.name || ''}
          executionHistory={executionHistory}
          currentExecutionId={currentExecutionId}
          setCurrentExecutionId={setCurrentExecutionId}
          onLoadExecutionSnapshot={loadExecutionSnapshot}
          tasks={Array.isArray(tasks) ? tasks : []}
          reassignments={Array.isArray(reassignments) ? reassignments : []}
          runtimeBusyAction={runtimeBusyAction}
          runtimeError={runtimeError}
          loopState={loopState}
          onStartLive={() => executeVersion('live')}
          onStartDry={() => executeVersion('dry_run')}
          onPause={pauseExecution}
          onResume={resumeExecution}
          onCancel={cancelExecution}
        />

        <div ref={reactFlowWrapper} className="flex-1 border-l border-zinc-200/70 border-r border-zinc-200/70 dark:border-zinc-800/80">
          {canvasTab === 'runtime' ? (
            <RuntimeMobileCanvas
              execution={execution}
              loopState={loopState}
              runtimeGraph={runtimeGraph}
              timeline={timeline}
            />
          ) : reactFlowDisabled ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-100 text-center dark:bg-zinc-900">
              <ShareIcon className="h-10 w-10 text-zinc-400 dark:text-zinc-600" />
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Canvas runtime is in compatibility mode.</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Nodes: {nodes.length} · Edges: {edges.length}</p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              fitView
              className="orchestration-canvas"
            >
              <Background gap={16} size={1} color="var(--xy-bg-dot, #e4e4e7)" />
              <Controls
                showInteractive={false}
                className="!border-zinc-200 !bg-white !shadow-sm dark:!border-zinc-700 dark:!bg-zinc-900 [&>button]:!border-zinc-200 [&>button]:!bg-white dark:[&>button]:!border-zinc-700 dark:[&>button]:!bg-zinc-900 [&>button>svg]:!fill-zinc-600 dark:[&>button>svg]:!fill-zinc-400"
              />
              <MiniMap
                nodeColor={(node) => (node.id === selectedNodeId ? '#f97316' : '#a1a1aa')}
                maskColor="rgba(0,0,0,0.1)"
                className="!border-zinc-200 !bg-zinc-50 dark:!border-zinc-700 dark:!bg-zinc-900"
              />

              {nodes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <ShareIcon className="h-12 w-12 text-zinc-300 dark:text-zinc-600" />
                    <p className="text-sm text-zinc-400">Drag agents from the palette to build your orchestration</p>
                  </div>
                </div>
              )}
            </ReactFlow>
          )}
        </div>

        {canvasTab === 'designer' && selectedNode ? (
          <NodeConfigPanel
            node={selectedNode}
            edges={edges}
            nodes={nodes}
            onClose={() => setSelectedNodeId(null)}
            onRemoveNode={removeNode}
          />
        ) : null}
        {canvasTab === 'designer' && selectedEdge && !selectedNode ? (
          <EdgeConfigPanel
            edge={selectedEdge}
            nodes={nodes}
            onClose={() => setSelectedEdgeId(null)}
            onRemoveEdge={removeEdge}
            onUpdatePolicy={updateEdgePolicy}
          />
        ) : null}
      </div>

      <style jsx global>{`
        .dark .orchestration-canvas {
          --xy-background-color: #09090b;
          --xy-bg-dot: #27272a;
          --xy-node-border-radius: 12px;
        }
        .dark .react-flow__controls button {
          background: #18181b;
          border-color: #3f3f46;
        }
        .dark .react-flow__controls button svg {
          fill: #a1a1aa;
        }
        .dark .react-flow__minimap {
          background: #18181b;
        }
      `}</style>
    </div>
  )
}

export default function OrchestrationCanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
