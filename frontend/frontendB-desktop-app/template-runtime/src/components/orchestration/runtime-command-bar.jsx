'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/button'
import { Badge } from '@/components/badge'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { statusColor, formatDate } from '@/lib/format'

function normalizeConsoleBase() {
  const raw = process.env.NEXT_PUBLIC_PROTOCOL_CONSOLE_URL || ''
  const base = raw.trim().replace(/\/+$/, '')
  return base
}

function withConsolePath(path) {
  const base = normalizeConsoleBase()
  return base ? `${base}${path}` : path
}

function shortId(value) {
  if (!value) return '--'
  const text = String(value)
  return text.length <= 12 ? text : text.slice(0, 12)
}

export function RuntimeCommandBar({
  executionHistory,
  currentExecutionId,
  setCurrentExecutionId,
  execution,
  runtimeGraph,
  timeline,
  approvals,
  mutations,
  validation,
  runtimeBusyAction,
  runtimeMessage,
  runtimeError,
  publishedVersion,
  loopState,
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
}) {
  const [dynamicNodeLabel, setDynamicNodeLabel] = useState('')
  const [dynamicNodeAgentId, setDynamicNodeAgentId] = useState('')
  const [spawnAgentId, setSpawnAgentId] = useState('')
  const [spawnSourceNodeId, setSpawnSourceNodeId] = useState('')
  const [rewireEdgeId, setRewireEdgeId] = useState('')
  const [rewireSource, setRewireSource] = useState('')
  const [rewireTarget, setRewireTarget] = useState('')
  const [configNodeId, setConfigNodeId] = useState('')
  const [configMaxRetries, setConfigMaxRetries] = useState('1')
  const [retryNodeId, setRetryNodeId] = useState('')
  const [replayNodeId, setReplayNodeId] = useState('')

  const runtimeNodes = Array.isArray(runtimeGraph?.nodes) ? runtimeGraph.nodes : []
  const runtimeEdges = Array.isArray(runtimeGraph?.edges) ? runtimeGraph.edges : []

  const failedNodes = useMemo(
    () => runtimeNodes.filter((node) => node.status === 'failed'),
    [runtimeNodes],
  )

  const observabilityHref = withConsolePath('/maple/observability')
  const auditHref = withConsolePath('/maple/audit')

  async function handleExecutionSelect(event) {
    const value = event.target.value
    setCurrentExecutionId(value)
    if (value) await loadExecutionSnapshot(value).catch(() => {})
  }

  async function handleAddDynamicNode() {
    await mutateExecution({
      op: 'add_node',
      node: {
        label: dynamicNodeLabel || undefined,
        agentId: dynamicNodeAgentId || undefined,
      },
    })
    setDynamicNodeLabel('')
  }

  async function handleSpawnAgent() {
    await mutateExecution({
      op: 'spawn_agent',
      agentId: spawnAgentId || undefined,
      sourceNodeId: spawnSourceNodeId || undefined,
      node: {
        label: `Spawned ${spawnAgentId || 'agent'}`,
        agentId: spawnAgentId || undefined,
      },
    })
  }

  async function handleRewireEdge() {
    await mutateExecution({
      op: 'rewire_edge',
      edgeId: rewireEdgeId || undefined,
      source: rewireSource || undefined,
      target: rewireTarget || undefined,
    })
  }

  async function handleUpdateNodeConfig() {
    const parsedMaxRetries = Number.parseInt(configMaxRetries, 10)
    await mutateExecution({
      op: 'update_node_config',
      nodeId: configNodeId,
      config: {
        maxRetries: Number.isFinite(parsedMaxRetries) ? parsedMaxRetries : 1,
      },
    })
  }

  async function handleApproval(approval, action, withStepUp = false) {
    const reason = window.prompt(`Reason for ${action}:`, '') || ''
    const challengeToken = withStepUp ? window.prompt('Step-up challenge token:', '') || '' : ''
    await submitApprovalDecision(approval.approvalId, action, reason, challengeToken)
  }

  const busy = Boolean(runtimeBusyAction)

  return (
    <section className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Runtime Control Plane
          </h3>
          {execution && (
            <Badge color={statusColor(execution.status || 'unknown')}>
              {execution.status || 'unknown'}
            </Badge>
          )}
          {publishedVersion && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Published: {publishedVersion}
            </span>
          )}
          {loopState && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Loop: {loopState.phase || 'plan'} · Iteration {loopState.iteration || 0}/{loopState.maxIterations || '--'}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Select value={currentExecutionId || ''} onChange={handleExecutionSelect} className="w-56">
              <option value="">No execution selected</option>
              {executionHistory.map((item) => {
                const executionId = item.executionId || item.id || ''
                return (
                  <option key={executionId} value={executionId}>
                    {shortId(executionId)} · {item.status || 'unknown'}
                  </option>
                )
              })}
            </Select>
            <Button href={observabilityHref} outline target="_blank" rel="noreferrer">Open Observability</Button>
            <Button href={auditHref} outline target="_blank" rel="noreferrer">Open Audit</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button color="orange" disabled={busy} onClick={() => validateDefinition(false)}>Validate</Button>
          <Button color="orange" disabled={busy} onClick={publishVersion}>Publish Version</Button>
          <Button color="orange" disabled={busy} onClick={() => executeVersion('dry_run')}>Dry Run</Button>
          <Button color="orange" disabled={busy} onClick={() => executeVersion('live')}>Execute Live</Button>
          <Button outline disabled={busy || !currentExecutionId} onClick={pauseExecution}>Pause</Button>
          <Button outline disabled={busy || !currentExecutionId} onClick={resumeExecution}>Resume</Button>
          <Button color="red" disabled={busy || !currentExecutionId} onClick={cancelExecution}>Cancel</Button>
          <Button outline disabled={busy || !currentExecutionId} onClick={exportExecutionSnapshot}>Snapshot Export</Button>
        </div>

        {runtimeMessage && (
          <p className="text-xs text-green-700 dark:text-green-400">{runtimeMessage}</p>
        )}
        {runtimeError && (
          <p className="text-xs text-red-700 dark:text-red-400">{runtimeError}</p>
        )}
        {validation && (
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Validation: {validation.ok ? 'pass' : 'fail'} · {validation.errors?.length || 0} errors · {validation.warnings?.length || 0} warnings
          </p>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Mutations</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input value={dynamicNodeLabel} onChange={(e) => setDynamicNodeLabel(e.target.value)} placeholder="Dynamic node label" />
              <Input value={dynamicNodeAgentId} onChange={(e) => setDynamicNodeAgentId(e.target.value)} placeholder="Dynamic node agentId" />
              <Button outline disabled={busy || !currentExecutionId} onClick={handleAddDynamicNode}>Add Dynamic Node</Button>

              <Input value={spawnAgentId} onChange={(e) => setSpawnAgentId(e.target.value)} placeholder="Spawn agentId" />
              <Input value={spawnSourceNodeId} onChange={(e) => setSpawnSourceNodeId(e.target.value)} placeholder="Spawn source nodeId" />
              <Button outline disabled={busy || !currentExecutionId} onClick={handleSpawnAgent}>Spawn Agent</Button>

              <Input value={rewireEdgeId} onChange={(e) => setRewireEdgeId(e.target.value)} placeholder="Edge ID (optional)" />
              <Input value={rewireSource} onChange={(e) => setRewireSource(e.target.value)} placeholder="Rewire source nodeId" />
              <Input value={rewireTarget} onChange={(e) => setRewireTarget(e.target.value)} placeholder="Rewire target nodeId" />
              <Button outline disabled={busy || !currentExecutionId} onClick={handleRewireEdge}>Rewire Edge</Button>

              <Select value={configNodeId} onChange={(e) => setConfigNodeId(e.target.value)}>
                <option value="">Select node for config</option>
                {runtimeNodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.id}</option>
                ))}
              </Select>
              <Input value={configMaxRetries} onChange={(e) => setConfigMaxRetries(e.target.value)} placeholder="Max retries" />
              <Button outline disabled={busy || !currentExecutionId || !configNodeId} onClick={handleUpdateNodeConfig}>Update Node Config</Button>
              <Button outline disabled={busy || !currentExecutionId} onClick={() => mutateExecution({ op: 'rollback_mutation' })}>Rollback Mutation</Button>
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Graph: {runtimeNodes.length} nodes · {runtimeEdges.length} edges · {mutations.length} mutations
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Approvals & Run Ops</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Select value={retryNodeId} onChange={(e) => setRetryNodeId(e.target.value)} className="min-w-44">
                <option value="">Retry failed node</option>
                {failedNodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.id}</option>
                ))}
              </Select>
              <Button outline disabled={busy || !currentExecutionId || !retryNodeId} onClick={() => retryFailedNode(retryNodeId)}>Retry Failed Node</Button>
              <Select value={replayNodeId} onChange={(e) => setReplayNodeId(e.target.value)} className="min-w-44">
                <option value="">Replay from node</option>
                {runtimeNodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.id}</option>
                ))}
              </Select>
              <Button outline disabled={busy || !currentExecutionId || !replayNodeId} onClick={() => replayFromNode(replayNodeId)}>Replay From Node</Button>
            </div>

            <div className="mt-3 space-y-2">
              {approvals.length === 0 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">No approvals pending.</p>
              )}
              {approvals.map((approval) => (
                <div key={approval.approvalId} className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 px-2 py-2 dark:border-zinc-700">
                  <span className="font-mono text-xs text-zinc-500">{shortId(approval.approvalId)}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">
                    {approval.nodeId} via {approval.edgeId}
                  </span>
                  <Badge color={statusColor(approval.status || 'pending')}>{approval.status || 'pending'}</Badge>
                  <Button outline disabled={busy || approval.status !== 'pending'} onClick={() => handleApproval(approval, 'approve')}>Approve</Button>
                  <Button color="red" disabled={busy || approval.status !== 'pending'} onClick={() => handleApproval(approval, 'reject')}>Reject</Button>
                  <Button outline disabled={busy || approval.status !== 'pending'} onClick={() => handleApproval(approval, 'approve', true)}>Step-up Verify</Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {timeline.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Execution Timeline</p>
            <div className="mt-2 max-h-44 space-y-1 overflow-auto">
              {[...timeline].slice(-40).reverse().map((event) => (
                <div key={event.id || `${event.sequence}-${event.eventType}`} className="flex items-start gap-2 rounded border border-zinc-100 px-2 py-1 text-xs dark:border-zinc-800">
                  <Badge color={statusColor(event.eventType || 'info')}>{event.eventType || 'event'}</Badge>
                  <span className="font-mono text-zinc-500">{shortId(event.executionId || currentExecutionId)}</span>
                  {event.phase ? <span className="text-zinc-500">phase {event.phase}</span> : null}
                  {event.iteration ? <span className="text-zinc-500">iter {event.iteration}</span> : null}
                  <span className="text-zinc-500">{formatDate(event.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
