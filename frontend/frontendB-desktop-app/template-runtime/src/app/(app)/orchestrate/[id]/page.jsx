'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useOrchestration } from '@/components/orchestration/use-orchestration'
import { AgentNode } from '@/components/orchestration/agent-node'
import { DelegationEdge } from '@/components/orchestration/delegation-edge'
import { CanvasToolbar } from '@/components/orchestration/canvas-toolbar'
import { AgentPalette } from '@/components/orchestration/agent-palette'
import { NodeConfigPanel } from '@/components/orchestration/node-config-panel'
import { EdgeConfigPanel } from '@/components/orchestration/edge-config-panel'
import { RuntimeCommandBar } from '@/components/orchestration/runtime-command-bar'
import { ShareIcon } from '@heroicons/react/24/outline'

const nodeTypes = { agentNode: AgentNode }
const edgeTypes = { delegationEdge: DelegationEdge }
const defaultEdgeOptions = { type: 'delegationEdge' }
const reactFlowDisabled = process.env.NEXT_PUBLIC_DISABLE_REACTFLOW === '1'

function CanvasInner() {
  const { id } = useParams()
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
    validation,
    executionHistory,
    currentExecutionId,
    setCurrentExecutionId,
    execution,
    runtimeGraph,
    timeline,
    mutations,
    approvals,
    runtimeBusyAction,
    runtimeMessage,
    runtimeError,
    publishedVersion,
    validateDefinition,
    publishVersion,
    executeVersion,
    pauseExecution,
    resumeExecution,
    cancelExecution,
    mutateExecution,
    retryFailedNode,
    replayFromNode,
    submitApprovalDecision,
    exportExecutionSnapshot,
    loadExecutionSnapshot,
  } = useOrchestration(id)

  const reactFlowWrapper = useRef(null)

  // Node position changes trigger auto-save
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes)
    const hasMoved = changes.some((c) => c.type === 'position' && c.dragging === false)
    if (hasMoved) scheduleSave()
  }, [onNodesChange, scheduleSave])

  // Click handlers
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

  // Drag and drop from palette
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Delete/Backspace - remove selected node or edge
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't intercept if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
        if (selectedNodeId) { removeNode(selectedNodeId); return }
        if (selectedEdgeId) { removeEdge(selectedEdgeId); return }
      }
      // Cmd+S - save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveNow()
      }
      // Escape - deselect / close panel
      if (e.key === 'Escape') {
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedEdgeId, removeNode, removeEdge, saveNow, setSelectedNodeId, setSelectedEdgeId])

  // Dirty indicator - beforeunload warning
  useEffect(() => {
    const handler = (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
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
        <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
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

      <div className="flex flex-1 overflow-hidden">
        {/* Left palette */}
        <AgentPalette nodes={nodes} />

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1">
          {reactFlowDisabled ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-100 text-center dark:bg-zinc-900">
              <ShareIcon className="h-10 w-10 text-zinc-400 dark:text-zinc-600" />
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Canvas runtime is in compatibility mode.
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Nodes: {nodes.length} · Edges: {edges.length}
              </p>
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
                nodeColor={(n) => (n.id === selectedNodeId ? '#f97316' : '#a1a1aa')}
                maskColor="rgba(0,0,0,0.1)"
                className="!border-zinc-200 !bg-zinc-50 dark:!border-zinc-700 dark:!bg-zinc-900"
              />

              {/* Empty state */}
              {nodes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <ShareIcon className="h-12 w-12 text-zinc-300 dark:text-zinc-600" />
                    <p className="text-sm text-zinc-400">
                      Drag agents from the palette to build your orchestration
                    </p>
                  </div>
                </div>
              )}
            </ReactFlow>
          )}
        </div>

        {/* Right panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            edges={edges}
            nodes={nodes}
            onClose={() => setSelectedNodeId(null)}
            onRemoveNode={removeNode}
          />
        )}
        {selectedEdge && !selectedNode && (
          <EdgeConfigPanel
            edge={selectedEdge}
            nodes={nodes}
            onClose={() => setSelectedEdgeId(null)}
            onRemoveEdge={removeEdge}
            onUpdatePolicy={updateEdgePolicy}
          />
        )}
      </div>

      <RuntimeCommandBar
        executionHistory={executionHistory}
        currentExecutionId={currentExecutionId}
        setCurrentExecutionId={setCurrentExecutionId}
        execution={execution}
        runtimeGraph={runtimeGraph}
        timeline={timeline}
        approvals={approvals}
        mutations={mutations}
        validation={validation}
        runtimeBusyAction={runtimeBusyAction}
        runtimeMessage={runtimeMessage}
        runtimeError={runtimeError}
        publishedVersion={publishedVersion}
        validateDefinition={validateDefinition}
        publishVersion={publishVersion}
        executeVersion={executeVersion}
        pauseExecution={pauseExecution}
        resumeExecution={resumeExecution}
        cancelExecution={cancelExecution}
        mutateExecution={mutateExecution}
        retryFailedNode={retryFailedNode}
        replayFromNode={replayFromNode}
        submitApprovalDecision={submitApprovalDecision}
        exportExecutionSnapshot={exportExecutionSnapshot}
        loadExecutionSnapshot={loadExecutionSnapshot}
      />

      {/* Dark mode CSS overrides for ReactFlow */}
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
