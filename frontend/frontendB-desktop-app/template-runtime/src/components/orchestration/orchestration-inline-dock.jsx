'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { TimedTaskPanel } from '@/components/orchestration/timed-task-panel'
import { formatDate, statusColor } from '@/lib/format'
import { useChat } from '@/contexts/chat-context'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid'

const TABS = [
  ['controls', 'Controls'],
  ['tasks', 'Tasks'],
  ['timeline', 'Timeline'],
  ['approvals', 'Approvals'],
  ['advanced', 'Advanced'],
]

function shortId(value) {
  if (!value) return '--'
  const text = String(value)
  return text.length <= 14 ? text : text.slice(0, 14)
}

export function OrchestrationInlineDock() {
  const {
    currentUser,
    selectedOrchestration,
    orchestrationsLoading,
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
    orchestrationDockExpanded,
    setOrchestrationDockExpanded,
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

  const [taskFilter, setTaskFilter] = useState('assigned')
  const [dynamicNodeLabel, setDynamicNodeLabel] = useState('')
  const [retryNodeId, setRetryNodeId] = useState('')
  const [replayNodeId, setReplayNodeId] = useState('')

  const runtimeNodes = Array.isArray(orchestrationRuntimeGraph?.nodes) ? orchestrationRuntimeGraph.nodes : []
  const approvals = Array.isArray(orchestrationRuntimeGraph?.approvals) ? orchestrationRuntimeGraph.approvals : []
  const failedNodes = runtimeNodes.filter((node) => node.status === 'failed')
  const busy = Boolean(orchestrationBusyAction)
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

  async function handleApproval(approvalId, decision) {
    await submitOrchestrationApprovalDecision(approvalId, decision)
  }

  if (!selectedOrchestration && !orchestrationsLoading) return null

  return (
    <section className="border-t border-zinc-200/80 bg-[var(--mayple-surface)] dark:border-zinc-800">
      <div className="mx-auto w-full max-w-3xl px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Orchestration Dock</p>
          <Badge color={statusColor(orchestrationExecution?.status || 'unknown')}>
            {orchestrationExecution?.status || 'idle'}
          </Badge>
          {orchestrationLoopState ? (
            <span className="text-xs text-zinc-500">
              {orchestrationLoopState.phase || 'plan'} · iteration {orchestrationLoopState.iteration || 0}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={orchestrationExecutionId || ''}
              onChange={(event) => selectOrchestrationExecution(event.target.value)}
              className="w-52"
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
            <button
              onClick={() => setOrchestrationDockExpanded((prev) => !prev)}
              className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              title={orchestrationDockExpanded ? 'Collapse dock' : 'Expand dock'}
            >
              {orchestrationDockExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronUpIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {orchestrationDockExpanded ? (
          <>
            <div className="mt-2 flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
              {TABS.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setOrchestrationPanelTab(value)}
                  className={[
                    'rounded-lg px-2.5 py-1 text-xs transition',
                    orchestrationPanelTab === value
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            {orchestrationRuntimeError ? (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {orchestrationRuntimeError}
              </p>
            ) : null}

            <div className="mt-2 max-h-[34dvh] overflow-y-auto">
              {orchestrationPanelTab === 'controls' ? (
                <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectedOrchestration?.name || (orchestrationsLoading ? 'Loading orchestration...' : 'No orchestration')}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <Button color="orange" disabled={busy || !selectedOrchestration} onClick={() => executeOrchestrationMode('live').catch(() => {})}>
                      Start Live
                    </Button>
                    <Button outline disabled={busy || !selectedOrchestration} onClick={() => executeOrchestrationMode('dry_run').catch(() => {})}>
                      Start Dry Run
                    </Button>
                    <Button outline disabled={busy || !orchestrationExecutionId} onClick={() => pauseOrchestration().catch(() => {})}>
                      Pause
                    </Button>
                    <Button outline disabled={busy || !orchestrationExecutionId} onClick={() => resumeOrchestration().catch(() => {})}>
                      Resume
                    </Button>
                    <Button color="red" disabled={busy || !orchestrationExecutionId} onClick={() => cancelOrchestration().catch(() => {})}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {orchestrationPanelTab === 'tasks' ? (
                <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
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
                        <div key={task.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                          <div className="flex items-center gap-2">
                            <p className="flex-1 truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">{task.title || task.id}</p>
                            <Badge color={statusColor(task.status || 'unknown')}>{task.status || 'unknown'}</Badge>
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-500">{task.ownerRole || '--'}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <TimedTaskPanel
                    tasks={filteredTasks}
                    reassignments={orchestrationReassignments}
                    runtimeBusyAction={orchestrationBusyAction}
                    onCreateReassignment={createOrchestrationReassignment}
                    onCancelReassignment={cancelOrchestrationReassignment}
                  />
                </div>
              ) : null}

              {orchestrationPanelTab === 'timeline' ? (
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  {orchestrationTimeline.length === 0 ? (
                    <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      No timeline events yet.
                    </p>
                  ) : (
                    [...orchestrationTimeline].slice(-80).reverse().map((event, index) => (
                      <div key={event.id || `${event.sequence || index}`} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                        <div className="flex items-center gap-2">
                          <Badge color={statusColor(event.eventType || 'unknown')}>{event.eventType || 'event'}</Badge>
                          <span className="text-xs text-zinc-500">{formatDate(event.timestamp)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : null}

              {orchestrationPanelTab === 'approvals' ? (
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  {approvals.length === 0 ? (
                    <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      No pending approvals.
                    </p>
                  ) : (
                    approvals.map((approval) => (
                      <div key={approval.approvalId} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                        <div className="flex items-center gap-2">
                          <p className="flex-1 font-mono text-xs text-zinc-700 dark:text-zinc-200">{shortId(approval.approvalId)}</p>
                          <Badge color={statusColor(approval.status || 'pending')}>{approval.status || 'pending'}</Badge>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button outline disabled={busy || approval.status !== 'pending'} onClick={() => handleApproval(approval.approvalId, 'approve').catch(() => {})}>
                            Approve
                          </Button>
                          <Button color="red" disabled={busy || approval.status !== 'pending'} onClick={() => handleApproval(approval.approvalId, 'reject').catch(() => {})}>
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : null}

              {orchestrationPanelTab === 'advanced' ? (
                <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Runtime Mutations</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input value={dynamicNodeLabel} onChange={(event) => setDynamicNodeLabel(event.target.value)} placeholder="Dynamic node label" />
                    <Button outline disabled={busy || !orchestrationExecutionId} onClick={() => mutateCurrentExecution({ op: 'add_node', node: { label: dynamicNodeLabel || undefined } }).then(() => setDynamicNodeLabel('')).catch(() => {})}>
                      Add Dynamic Node
                    </Button>
                    <Button outline disabled={busy || !orchestrationExecutionId} onClick={() => mutateCurrentExecution({ op: 'rollback_mutation' }).catch(() => {})}>
                      Rollback Mutation
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={retryNodeId} onChange={(event) => setRetryNodeId(event.target.value)}>
                      <option value="">Retry failed node</option>
                      {failedNodes.map((node) => (
                        <option key={node.id} value={node.id}>{node.id}</option>
                      ))}
                    </Select>
                    <Button outline disabled={busy || !retryNodeId || !orchestrationExecutionId} onClick={() => retryExecutionNode(retryNodeId).catch(() => {})}>
                      Retry Failed Node
                    </Button>
                    <Select value={replayNodeId} onChange={(event) => setReplayNodeId(event.target.value)}>
                      <option value="">Replay from node</option>
                      {runtimeNodes.map((node) => (
                        <option key={node.id} value={node.id}>{node.id}</option>
                      ))}
                    </Select>
                    <Button outline disabled={busy || !replayNodeId || !orchestrationExecutionId} onClick={() => replayExecutionFromNode(replayNodeId).catch(() => {})}>
                      Replay From Node
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
