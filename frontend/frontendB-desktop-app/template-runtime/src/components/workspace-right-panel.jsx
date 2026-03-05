'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { ExecutionTrace } from '@/components/agent-workspace/execution-trace'
import { DelegationTree } from '@/components/agent-workspace/delegation-tree'
import { TimedTaskPanel } from '@/components/orchestration/timed-task-panel'
import { statusColor, formatDate } from '@/lib/format'
import { useChat } from '@/contexts/chat-context'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'

const WIDTH_KEY = 'mayple_right_panel_width'
const MIN_WIDTH = 320
const MAX_WIDTH = 720

function readPanelWidth() {
  if (typeof window === 'undefined') return 420
  const raw = Number(window.localStorage.getItem(WIDTH_KEY) || 420)
  if (!Number.isFinite(raw)) return 420
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, raw))
}

function shortId(value) {
  if (!value) return '--'
  const text = String(value)
  return text.length <= 14 ? text : text.slice(0, 14)
}

function ModeTabs({ tabs, value, onChange }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-900">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={[
            'rounded-md px-2 py-1 text-xs transition-colors',
            value === tab.value
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function WorkspaceRightPanel() {
  const {
    mode,
    rightPanelOpen,
    setRightPanelOpen,

    // Agent mode
    events,
    runs,
    currentRunId,

    // Orchestration mode
    currentUser,
    orchestrationsLoading,
    selectedOrchestration,
    orchestrationExecutionHistory,
    orchestrationExecutionId,
    selectOrchestrationExecution,
    orchestrationExecution,
    orchestrationRuntimeGraph,
    orchestrationTimeline,
    orchestrationTasks,
    orchestrationReassignments,
    orchestrationLoopState,
    orchestrationPanelTab,
    setOrchestrationPanelTab,
    orchestrationBusyAction,
    orchestrationRuntimeError,
    executeOrchestrationMode,
    pauseOrchestration,
    resumeOrchestration,
    cancelOrchestration,
    createOrchestrationReassignment,
    cancelOrchestrationReassignment,
    submitOrchestrationApprovalDecision,
    mutateCurrentExecution,
    retryExecutionNode,
    replayExecutionFromNode,
  } = useChat()

  const [width, setWidth] = useState(() => readPanelWidth())
  const [agentPanelTab, setAgentPanelTab] = useState('trace')
  const [taskFilter, setTaskFilter] = useState('assigned')
  const [retryNodeId, setRetryNodeId] = useState('')
  const [replayNodeId, setReplayNodeId] = useState('')
  const [addNodeLabel, setAddNodeLabel] = useState('')
  const [roleWarning, setRoleWarning] = useState('')

  const runtimeNodes = Array.isArray(orchestrationRuntimeGraph?.nodes) ? orchestrationRuntimeGraph.nodes : []
  const approvals = Array.isArray(orchestrationRuntimeGraph?.approvals) ? orchestrationRuntimeGraph.approvals : []

  const currentUserId = String(currentUser?.id || '')
  const roleHints = useMemo(() => {
    const hints = [String(currentUser?.role || '').toLowerCase(), 'manager', 'owner']
    return hints.filter(Boolean)
  }, [currentUser?.role])

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'all') return orchestrationTasks
    return orchestrationTasks.filter((task) => {
      const ownerAgentId = String(task.ownerAgentId || '')
      const ownerRole = String(task.ownerRole || '').toLowerCase()
      if (ownerAgentId && currentUserId && ownerAgentId === currentUserId) return true
      return roleHints.some((hint) => ownerRole.includes(hint))
    })
  }, [orchestrationTasks, taskFilter, currentUserId, roleHints])

  function beginResize(event) {
    if (typeof window === 'undefined') return
    const startX = event.clientX
    const startWidth = width
    let latestWidth = startWidth

    function onMouseMove(moveEvent) {
      const delta = startX - moveEvent.clientX
      const nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta))
      latestWidth = nextWidth
      setWidth(nextWidth)
    }

    function onMouseUp() {
      window.localStorage.setItem(WIDTH_KEY, String(latestWidth))
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  async function handleTaskReassignment(payload) {
    setRoleWarning('')
    const targetRole = String(payload?.targetRole || '').trim()
    if (targetRole) {
      const hasMappedTask = orchestrationTasks.some((task) => String(task.ownerRole || '').toLowerCase() === targetRole.toLowerCase())
      if (!hasMappedTask) {
        setRoleWarning('No mapped agent currently exists for that role. Reassignment can still be queued.')
      }
    }
    return createOrchestrationReassignment(payload)
  }

  async function handleApproval(approvalId, decision) {
    await submitOrchestrationApprovalDecision(approvalId, decision)
  }

  const busy = Boolean(orchestrationBusyAction)

  if (!rightPanelOpen) {
    return (
      <aside className="flex shrink-0 items-center border-l border-zinc-200 bg-white/80 px-1 dark:border-zinc-800 dark:bg-zinc-950/80">
        <button
          onClick={() => setRightPanelOpen(true)}
          className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Show right panel"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="relative shrink-0 border-l border-zinc-200 bg-white/85 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/85" style={{ width }}>
      <div
        onMouseDown={beginResize}
        className="absolute top-0 left-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-orange-400/40"
        title="Resize panel"
      />

      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {mode === 'orchestration' ? 'Orchestration Control' : 'Runtime Panel'}
          </p>
          <button
            onClick={() => setRightPanelOpen(false)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Hide right panel"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>

        {mode === 'agent' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="p-3">
              <ModeTabs
                value={agentPanelTab}
                onChange={setAgentPanelTab}
                tabs={[
                  { value: 'trace', label: 'Trace' },
                  { value: 'delegation', label: 'Delegation' },
                ]}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {agentPanelTab === 'trace' ? (
                <ExecutionTrace events={events} currentRunId={currentRunId} />
              ) : (
                <DelegationTree runs={runs} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
              <ModeTabs
                value={orchestrationPanelTab}
                onChange={setOrchestrationPanelTab}
                tabs={[
                  { value: 'tasks', label: 'Tasks' },
                  { value: 'runtime', label: 'Runtime' },
                  { value: 'timeline', label: 'Timeline' },
                  { value: 'approvals', label: 'Approvals' },
                  { value: 'advanced', label: 'Advanced' },
                ]}
              />

              <div className="flex items-center gap-2">
                <Select
                  value={orchestrationExecutionId || ''}
                  onChange={(event) => selectOrchestrationExecution(event.target.value)}
                  className="w-full"
                >
                  <option value="">No execution selected</option>
                  {orchestrationExecutionHistory.map((item) => {
                    const id = String(item.executionId || item.id || '')
                    return (
                      <option key={id} value={id}>
                        {shortId(id)} · {item.status || 'unknown'}
                      </option>
                    )
                  })}
                </Select>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {orchestrationRuntimeError ? (
                <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {orchestrationRuntimeError}
                </p>
              ) : null}

              {orchestrationPanelTab === 'tasks' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Assigned Tasks</p>
                    <Select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)} className="w-28">
                      <option value="assigned">Assigned</option>
                      <option value="all">All</option>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    {filteredTasks.length === 0 ? (
                      <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                        No tasks match current filter.
                      </p>
                    ) : (
                      filteredTasks.map((task) => (
                        <div key={task.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                          <div className="flex items-center gap-2">
                            <p className="flex-1 truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">{task.title || task.id}</p>
                            <Badge color={statusColor(task.status || 'unknown')}>{task.status || 'unknown'}</Badge>
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                            {task.ownerRole || '--'} {task.ownerAgentId ? `· ${task.ownerAgentId}` : ''}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {roleWarning ? (
                    <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                      {roleWarning}
                    </p>
                  ) : null}

                  <TimedTaskPanel
                    tasks={filteredTasks}
                    reassignments={orchestrationReassignments}
                    runtimeBusyAction={orchestrationBusyAction}
                    onCreateReassignment={handleTaskReassignment}
                    onCancelReassignment={cancelOrchestrationReassignment}
                  />
                </div>
              ) : null}

              {orchestrationPanelTab === 'runtime' ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {selectedOrchestration?.name || (orchestrationsLoading ? 'Loading orchestration...' : 'No orchestration')}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge color={statusColor(orchestrationExecution?.status || 'unknown')}>
                        {orchestrationExecution?.status || 'idle'}
                      </Badge>
                      {orchestrationLoopState ? (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {orchestrationLoopState.phase || 'plan'} · iteration {orchestrationLoopState.iteration || 0}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button color="orange" disabled={busy || !selectedOrchestration} onClick={() => executeOrchestrationMode('live').catch(() => {})}>Start Live</Button>
                    <Button outline disabled={busy || !selectedOrchestration} onClick={() => executeOrchestrationMode('dry_run').catch(() => {})}>Start Dry Run</Button>
                    <Button outline disabled={busy || !orchestrationExecutionId} onClick={() => pauseOrchestration().catch(() => {})}>Pause</Button>
                    <Button outline disabled={busy || !orchestrationExecutionId} onClick={() => resumeOrchestration().catch(() => {})}>Resume</Button>
                    <Button color="red" className="col-span-2" disabled={busy || !orchestrationExecutionId} onClick={() => cancelOrchestration().catch(() => {})}>Cancel</Button>
                  </div>
                </div>
              ) : null}

              {orchestrationPanelTab === 'timeline' ? (
                <div className="space-y-2">
                  {orchestrationTimeline.length === 0 ? (
                    <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      No timeline events for this execution.
                    </p>
                  ) : (
                    [...orchestrationTimeline].slice(-120).reverse().map((event, index) => (
                      <div key={event.id || `${event.sequence || index}`} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                        <div className="flex items-center gap-2">
                          <Badge color={statusColor(event.eventType || 'unknown')}>{event.eventType || 'event'}</Badge>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatDate(event.timestamp)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                          phase {event.phase || '--'} · iter {event.iteration || 0}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              ) : null}

              {orchestrationPanelTab === 'approvals' ? (
                <div className="space-y-2">
                  {approvals.length === 0 ? (
                    <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      No pending approvals.
                    </p>
                  ) : (
                    approvals.map((approval) => (
                      <div key={approval.approvalId} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                        <div className="flex items-center gap-2">
                          <p className="flex-1 font-mono text-xs text-zinc-700 dark:text-zinc-200">{shortId(approval.approvalId)}</p>
                          <Badge color={statusColor(approval.status || 'pending')}>{approval.status || 'pending'}</Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">node {approval.nodeId || '--'}</p>
                        <div className="mt-2 flex gap-2">
                          <Button outline disabled={busy || approval.status !== 'pending'} onClick={() => handleApproval(approval.approvalId, 'approve').catch(() => {})}>Approve</Button>
                          <Button color="red" disabled={busy || approval.status !== 'pending'} onClick={() => handleApproval(approval.approvalId, 'reject').catch(() => {})}>Reject</Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : null}

              {orchestrationPanelTab === 'advanced' ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Runtime Mutations</p>
                    <div className="mt-2 space-y-2">
                      <Input value={addNodeLabel} onChange={(event) => setAddNodeLabel(event.target.value)} placeholder="Dynamic node label" />
                      <Button outline disabled={busy || !orchestrationExecutionId} onClick={() => mutateCurrentExecution({ op: 'add_node', node: { label: addNodeLabel || undefined } }).then(() => setAddNodeLabel('')).catch(() => {})}>
                        Add Dynamic Node
                      </Button>
                      <Button outline disabled={busy || !orchestrationExecutionId} onClick={() => mutateCurrentExecution({ op: 'rollback_mutation' }).catch(() => {})}>
                        Rollback Mutation
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Retry / Replay</p>
                    <div className="mt-2 grid gap-2">
                      <Select value={retryNodeId} onChange={(event) => setRetryNodeId(event.target.value)}>
                        <option value="">Select failed node</option>
                        {runtimeNodes.filter((node) => node.status === 'failed').map((node) => (
                          <option key={node.id} value={node.id}>{node.id}</option>
                        ))}
                      </Select>
                      <Button outline disabled={busy || !retryNodeId || !orchestrationExecutionId} onClick={() => retryExecutionNode(retryNodeId).catch(() => {})}>
                        Retry Failed Node
                      </Button>

                      <Select value={replayNodeId} onChange={(event) => setReplayNodeId(event.target.value)}>
                        <option value="">Select replay node</option>
                        {runtimeNodes.map((node) => (
                          <option key={node.id} value={node.id}>{node.id}</option>
                        ))}
                      </Select>
                      <Button outline disabled={busy || !replayNodeId || !orchestrationExecutionId} onClick={() => replayExecutionFromNode(replayNodeId).catch(() => {})}>
                        Replay From Node
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
