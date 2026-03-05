'use client'

import { useEffect, useMemo, useState } from 'react'

import { InterventionCommandBar } from './InterventionCommandBar'
import { MonitoringContextExplainer } from './MonitoringContextExplainer'
import { allSections } from '../../app/allSections.js'
import { filterFrontendBOrigin } from '../../lib/maple-workspace/origin-filter.js'
import { interventionActionCatalog } from '../../lib/maple-workspace/intervention-api.js'
import {
  MAPLE_ROUTE_REGISTRY,
  MAPLE_WORKSPACE_CATEGORIES,
} from '../../lib/maple-workspace/route-registry.js'
import {
  buildMonitoringQuickPrompts,
  requestMonitoringChat,
} from '../../lib/maple-workspace/monitoring-chat.js'

async function loadJson(path) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`${path} -> ${response.status}`)
  }
  return response.json()
}

function asArray(payload) {
  if (Array.isArray(payload)) {
    return payload
  }
  if (!payload || typeof payload !== 'object') {
    return []
  }
  const candidates = [payload.items, payload.executions, payload.events, payload.entries, payload.approvals]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }
  }
  return []
}

function executionFromRecord(record) {
  if (!record || typeof record !== 'object') {
    return null
  }

  const execution = record.execution ?? record
  const executionId = String(execution.executionId ?? execution.id ?? '').trim()
  if (!executionId) {
    return null
  }

  return {
    ...execution,
    executionId,
    sessionId: String(execution.sessionId ?? execution.session_id ?? '').trim(),
    status: String(execution.status ?? execution.state ?? 'unknown').toLowerCase(),
    source: String(execution.source ?? execution.origin ?? execution.producer ?? ''),
  }
}

function buildTimelineNodes(execution, events) {
  const graphNodes = Array.isArray(execution?.graph?.nodes) ? execution.graph.nodes : []
  if (graphNodes.length > 0) {
    return graphNodes.map((node, index) => ({
      id: String(node.id ?? `node-${index}`),
      label: String(node.label ?? node.name ?? node.id ?? `Node ${index + 1}`),
      status: String(node.status ?? 'unknown').toLowerCase(),
      actor: String(node.agentId ?? node.actor ?? 'agent'),
      type: String(node.type ?? 'step'),
      approvalId: String(node.approvalId ?? ''),
      index,
    }))
  }

  const timeline = Array.isArray(execution?.timeline) ? execution.timeline : []
  if (timeline.length > 0) {
    return timeline.map((entry, index) => ({
      id: String(entry.id ?? `timeline-${index}`),
      label: String(entry.message ?? entry.eventType ?? entry.event ?? `Step ${index + 1}`),
      status: String(entry.status ?? entry.severity ?? execution?.status ?? 'unknown').toLowerCase(),
      actor: String(entry.actor ?? 'runtime'),
      type: String(entry.eventType ?? entry.type ?? 'event'),
      approvalId: String(entry.approvalId ?? ''),
      index,
    }))
  }

  return events.slice(0, 8).map((event, index) => ({
    id: String(event.id ?? `event-${index}`),
    label: String(event.eventType ?? event.type ?? event.action ?? `Event ${index + 1}`),
    status: String(event.status ?? event.severity ?? 'observed').toLowerCase(),
    actor: String(event.actor ?? event.source ?? 'runtime'),
    type: String(event.eventType ?? event.type ?? 'event'),
    approvalId: String(event.approvalId ?? ''),
    index,
  }))
}

function resolveRiskClass(node) {
  const status = String(node.status ?? '').toLowerCase()
  const label = `${node.label} ${node.type}`.toLowerCase()

  if (status.includes('fail') || status.includes('cancel') || status.includes('block')) {
    return 'risk-critical'
  }
  if (status.includes('warn') || status.includes('pause') || label.includes('escalat')) {
    return 'risk-high'
  }
  if (status.includes('pending') || status.includes('queued')) {
    return 'risk-medium'
  }
  return 'risk-low'
}

function summarizeExecution(execution, events) {
  if (!execution) {
    return {
      status: 'Unknown',
      risk: 'Low',
      approvals: 0,
      recommendation: 'Select a runtime execution to begin intervention.',
    }
  }

  const failedSignals = events.filter((event) => {
    const value = String(event.status ?? event.severity ?? event.eventType ?? '').toLowerCase()
    return value.includes('fail') || value.includes('critical') || value.includes('block')
  }).length

  const pendingApprovals = Array.isArray(execution?.graph?.approvals)
    ? execution.graph.approvals.length
    : 0

  const risk = failedSignals > 2 || execution.status === 'failed'
    ? 'High'
    : failedSignals > 0 || execution.status === 'paused'
      ? 'Medium'
      : 'Low'

  const recommendation =
    risk === 'High'
      ? 'Pause execution, inspect blocked nodes, then replay from the latest safe step.'
      : risk === 'Medium'
        ? 'Review pending approvals and run targeted retry/replay where needed.'
        : 'Continue monitoring and keep escalation controls ready.'

  return {
    status: execution.status || 'unknown',
    risk,
    approvals: pendingApprovals,
    recommendation,
  }
}

const LEGACY_DOC_PAGES = Object.freeze([
  {
    path: '/',
    title: 'Operations Overview',
    description: 'Mayple control plane overview for policy, approvals, audit, and runtime operations.',
    sections: ['Control Plane', 'Workflow', 'Live Endpoints'],
  },
  {
    path: '/quickstart',
    title: 'Quickstart',
    description: 'Client setup, first request flow, and next-step navigation across API docs.',
    sections: ['Choose your client', 'Making your first API request', "What's next?"],
  },
  {
    path: '/sdks',
    title: 'Protocol SDKs',
    description: 'Official SDK coverage and language choices.',
    sections: ['Official libraries'],
  },
  {
    path: '/authentication',
    title: 'Authentication',
    description: 'Basic auth, bearer tokens, and SDK auth guidance.',
    sections: ['Basic authentication', 'OAuth2 with bearer token', 'Using an SDK'],
  },
  {
    path: '/conversations',
    title: 'Conversations',
    description: 'Conversation model and full CRUD endpoint documentation.',
    sections: [
      'The conversation model',
      'List all conversations',
      'Create a conversation',
      'Retrieve a conversation',
      'Update a conversation',
      'Delete a conversation',
    ],
  },
  {
    path: '/contacts',
    title: 'Contacts',
    description: 'Contact model and full CRUD endpoint documentation.',
    sections: [
      'The contact model',
      'List all contacts',
      'Create a contact',
      'Retrieve a contact',
      'Update a contact',
      'Delete a contact',
    ],
  },
  {
    path: '/groups',
    title: 'Groups',
    description: 'Group model and full CRUD endpoint documentation.',
    sections: [
      'The group model',
      'List all groups',
      'Create a group',
      'Retrieve a group',
      'Update a group',
      'Delete a group',
    ],
  },
  {
    path: '/messages',
    title: 'Messages',
    description: 'Message model and full CRUD endpoint documentation.',
    sections: [
      'The message model',
      'List all messages',
      'Send a message',
      'Retrieve a message',
      'Update a message',
      'Delete a message',
    ],
  },
  {
    path: '/attachments',
    title: 'Attachments',
    description: 'Attachment model and full CRUD endpoint documentation.',
    sections: [
      'The attachment model',
      'List all attachments',
      'Create an attachment',
      'Retrieve an attachment',
      'Update an attachment',
      'Delete an attachment',
    ],
  },
  {
    path: '/webhooks',
    title: 'Webhooks',
    description: 'Webhook registration, event types, payload handling, and signature verification.',
    sections: ['Registering webhooks', 'Consuming webhooks', 'Event types', 'Security'],
  },
  {
    path: '/pagination',
    title: 'Pagination',
    description: 'Cursor pagination semantics and iteration patterns.',
    sections: ['Example using cursors'],
  },
  {
    path: '/errors',
    title: 'Errors',
    description: 'Status-code and error-type references for API operations.',
    sections: ['Status codes', 'Error types'],
  },
])

const LEGACY_PROTOCOL_ENDPOINTS = Object.freeze([
  'GET /v1/conversations',
  'POST /v1/conversations',
  'GET /v1/conversations/:id',
  'PUT /v1/conversations/:id',
  'DELETE /v1/conversations/:id',
  'GET /v1/contacts',
  'POST /v1/contacts',
  'GET /v1/contacts/:id',
  'PUT /v1/contacts/:id',
  'DELETE /v1/contacts/:id',
  'GET /v1/groups',
  'POST /v1/groups',
  'GET /v1/groups/:id',
  'PUT /v1/groups/:id',
  'DELETE /v1/groups/:id',
  'GET /v1/messages',
  'POST /v1/messages',
  'GET /v1/messages/:id',
  'PUT /v1/messages/:id',
  'DELETE /v1/messages/:id',
  'GET /v1/attachments',
  'POST /v1/attachments',
  'GET /v1/attachments/:id',
  'PUT /v1/attachments/:id',
  'DELETE /v1/attachments/:id',
  'POST /v1/webhooks',
])

const INTERVENTION_ACTION_REFERENCE = Object.freeze([
  {
    label: 'Pause execution',
    endpoint: 'POST /api/orchestrations/executions/:executionId/pause',
    guidance: 'Use first to freeze blast radius before diagnosis.',
    destructive: false,
  },
  {
    label: 'Resume execution',
    endpoint: 'POST /api/orchestrations/executions/:executionId/resume',
    guidance: 'Use after guard verification and node-level recovery checks.',
    destructive: false,
  },
  {
    label: 'Cancel execution',
    endpoint: 'POST /api/orchestrations/executions/:executionId/cancel',
    guidance: 'Use when run is unsafe or unrecoverable. Requires confirm + reason.',
    destructive: true,
  },
  {
    label: 'Retry node',
    endpoint: 'POST /api/orchestrations/executions/:executionId/retry-node',
    guidance: 'Retry a failed node after targeted mitigation.',
    destructive: false,
  },
  {
    label: 'Replay from node',
    endpoint: 'POST /api/orchestrations/executions/:executionId/replay-from-node',
    guidance: 'Rewind to a safe checkpoint and rerun the branch.',
    destructive: false,
  },
  {
    label: 'Approval decision',
    endpoint: 'POST /api/orchestrations/executions/:executionId/approvals/:approvalId/decision',
    guidance: 'Approve or reject pending approval gates with policy context.',
    destructive: true,
  },
  {
    label: 'Escalation trigger',
    endpoint: 'POST /api/operations/orchestrations/escalation/escalate',
    guidance: 'Escalate incidents to designated responder chains.',
    destructive: false,
  },
  {
    label: 'Break-glass execute/review',
    endpoint: 'POST /api/operations/orchestrations/break-glass and /break-glass/:id/review',
    guidance: 'Emergency override path. Requires reason, audit, and review follow-up.',
    destructive: true,
  },
  {
    label: 'Step-up challenge/verify',
    endpoint: 'POST /api/operations/orchestrations/step-up/challenge and /step-up/verify',
    guidance: 'Mandatory when backend requires elevated assurance.',
    destructive: false,
  },
  {
    label: 'Session cancel',
    endpoint: 'POST /api/openclaw/agent/sessions/:sessionId/cancel',
    guidance: 'Stop active agent loop at session layer.',
    destructive: true,
  },
])

const OBSERVE_CHAT_MAX_MESSAGES = 120

function trimObserveChatMessages(messages) {
  if (messages.length <= OBSERVE_CHAT_MAX_MESSAGES) {
    return messages
  }
  return messages.slice(messages.length - OBSERVE_CHAT_MAX_MESSAGES)
}

function NodeActionModal({
  open,
  node,
  execution,
  sessionId,
  onClose,
  onTargetChange,
}) {
  const actions = useMemo(() => interventionActionCatalog(), [])
  const [reason, setReason] = useState('')
  const [challengeToken, setChallengeToken] = useState('')
  const [busy, setBusy] = useState('')
  const [statusMessage, setStatusMessage] = useState('Tip: click any node in Action Tree to intervene.')
  const [output, setOutput] = useState('{}')

  useEffect(() => {
    if (!open) {
      return
    }
    setReason('')
    setChallengeToken('')
    setBusy('')
    setStatusMessage('Node selected. Choose an intervention.')
  }, [open, node?.id])

  const executionId = String(execution?.executionId ?? '')
  const selectedSessionId = String(execution?.sessionId ?? sessionId ?? '')
  const nodeId = String(node?.id ?? '')

  async function runAction(actionName, options = {}) {
    const action = actions[actionName]
    if (!action) {
      return
    }

    if (!executionId && actionName !== 'requestStepUp' && actionName !== 'verifyStepUp') {
      setStatusMessage('Select an execution before running node actions.')
      return
    }

    if (options.requiresReason && !reason.trim()) {
      setStatusMessage('Reason is required for this action.')
      return
    }

    setBusy(actionName)
    setStatusMessage(`Running ${action.label}...`)

    try {
      const payload = await action.execute({
        executionId,
        sessionId: selectedSessionId,
        nodeId,
        approvalId: node?.approvalId ?? '',
        breakGlassReviewId: node?.approvalId ?? '',
        reason,
        challengeToken,
      })

      if (actionName === 'pauseExecution') {
        setStatusMessage('Execution paused. Inspect state before next step.')
      } else if (actionName === 'cancelExecution') {
        setStatusMessage('Execution canceled and safely stopped.')
      } else {
        setStatusMessage(`${action.label} completed.`)
      }

      setOutput(
        JSON.stringify(
          {
            action: action.label,
            at: new Date().toISOString(),
            executionId,
            nodeId,
            response: payload,
          },
          null,
          2,
        ),
      )

      onTargetChange?.({ executionId, sessionId: selectedSessionId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed.'
      setStatusMessage(message)
      setOutput(
        JSON.stringify(
          {
            action: action.label,
            at: new Date().toISOString(),
            executionId,
            nodeId,
            error: message,
          },
          null,
          2,
        ),
      )
    } finally {
      setBusy('')
    }
  }

  async function runTelemetryProbe(kind) {
    setBusy(kind)
    setStatusMessage(`Running ${kind} telemetry probe...`)
    try {
      const payload =
        kind === 'risk'
          ? await loadJson('/api/observability/orchestrations/summary')
          : await loadJson('/api/observability/orchestrations/slo')
      setOutput(
        JSON.stringify(
          {
            probe: kind,
            at: new Date().toISOString(),
            executionId,
            nodeId,
            payload,
          },
          null,
          2,
        ),
      )
      setStatusMessage(`${kind === 'risk' ? 'Risk audit' : 'Anomaly'} probe completed.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Probe failed.'
      setStatusMessage(message)
    } finally {
      setBusy('')
    }
  }

  function generateGrowthOutput(kind) {
    const payload = {
      action: kind,
      at: new Date().toISOString(),
      executionId,
      nodeId,
      guidance:
        kind === 'Share Trace'
          ? 'Escalate this trace to incident responders with current node context.'
          : kind === 'Suggest Skills'
            ? 'Recommend retry + replay runbook and policy guardrail checklist.'
            : 'Create a concise incident brief with risk posture and intervention history.',
    }
    setOutput(JSON.stringify(payload, null, 2))
    setStatusMessage(`${kind} artifact generated.`)
  }

  if (!open || !node) {
    return null
  }

  return (
    <div id="nodeActionModal" className="modal" role="dialog" aria-labelledby="nodeModalTitle">
      <div className="modal-card">
        <div className="modal-head">
          <h2 id="nodeModalTitle">Node Actions</h2>
          <button id="nodeModalCloseBtn" className="modal-close-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <p id="nodeModalSummary" className="modal-sub">
          {node.label}
        </p>

        <dl className="kv-grid kv-grid-inline modal-kv">
          <div className="kv-row">
            <dt>Trace</dt>
            <dd id="nodeModalTraceId" className="mono">
              {executionId || '-'}
            </dd>
          </div>
          <div className="kv-row">
            <dt>Session</dt>
            <dd id="nodeModalSessionId" className="mono">
              {selectedSessionId || '-'}
            </dd>
          </div>
          <div className="kv-row">
            <dt>Step</dt>
            <dd id="nodeModalStepIndex">#{Number(node.index ?? 0) + 1}</dd>
          </div>
          <div className="kv-row">
            <dt>Type</dt>
            <dd id="nodeModalStepType">{node.type}</dd>
          </div>
        </dl>

        <details className="action-group" open>
          <summary>Guard</summary>
          <div className="modal-panel">
            <p className="modal-action-desc">Allow, block, or pause this step.</p>
            <div className="quick-grid three">
              <button id="nodeGuardAllowBtn" className="action-btn success" type="button" onClick={() => runAction('resumeExecution')} disabled={Boolean(busy)}>
                Allow
              </button>
              <button id="nodeGuardBlockBtn" className="action-btn danger" type="button" onClick={() => runAction('cancelExecution', { requiresReason: true })} disabled={Boolean(busy)}>
                Block
              </button>
              <button id="nodeGuardPendingBtn" className="action-btn muted" type="button" onClick={() => runAction('pauseExecution')} disabled={Boolean(busy)}>
                Pending
              </button>
            </div>
            <div className="modal-field">
              <label htmlFor="nodeGuardReason">Reason (required for block)</label>
              <input id="nodeGuardReason" type="text" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this decision?" autoComplete="off" />
            </div>
          </div>
        </details>

        <details className="action-group" open>
          <summary>Fork</summary>
          <div className="modal-panel">
            <p className="modal-action-desc">Create a safer branch from this step.</p>
            <button id="nodeForkCreateBtn" className="action-btn primary wide" type="button" onClick={() => runAction('replayNode')} disabled={Boolean(busy)}>
              Create Safe Fork
            </button>
            <div className="quick-grid two">
              <button className="action-btn" type="button" onClick={() => runAction('retryNode')} disabled={Boolean(busy)}>
                Retry Node
              </button>
              <button className="action-btn" type="button" onClick={() => runAction('requestStepUp')} disabled={Boolean(busy)}>
                Step-up
              </button>
            </div>
            <div className="modal-field">
              <label htmlFor="nodeChallengeToken">Challenge token</label>
              <input
                id="nodeChallengeToken"
                type="text"
                value={challengeToken}
                onChange={(event) => setChallengeToken(event.target.value)}
                placeholder="Optional unless backend requires step-up"
                autoComplete="off"
              />
            </div>
          </div>
        </details>

        <details className="action-group" open>
          <summary>Risk</summary>
          <div className="modal-panel">
            <p className="modal-action-desc">Run risk and anomaly checks.</p>
            <div className="quick-grid two">
              <button id="nodeAuditBtn" className="action-btn" type="button" onClick={() => runTelemetryProbe('risk')} disabled={Boolean(busy)}>
                Audit Risk
              </button>
              <button id="nodeMlBtn" className="action-btn" type="button" onClick={() => runTelemetryProbe('anomaly')} disabled={Boolean(busy)}>
                ML Anomaly
              </button>
            </div>
          </div>
        </details>

        <details className="action-group" open>
          <summary>Growth</summary>
          <div className="modal-panel">
            <p className="modal-action-desc">Share and generate growth artifacts.</p>
            <div className="quick-grid three">
              <button id="nodeShareBtn" className="action-btn" type="button" onClick={() => generateGrowthOutput('Share Trace')}>
                Share Trace
              </button>
              <button id="nodeSuggestBtn" className="action-btn" type="button" onClick={() => generateGrowthOutput('Suggest Skills')}>
                Suggest Skills
              </button>
              <button id="nodeBriefBtn" className="action-btn" type="button" onClick={() => generateGrowthOutput('YC Brief')}>
                YC Brief
              </button>
            </div>
          </div>
        </details>

        <details className="modal-output-wrap" open>
          <summary>Latest Action Output</summary>
          <pre id="nodeModalOutput" className="json-panel modal-output">
            {output}
          </pre>
        </details>

        <p id="nodeModalStatus" className="modal-status">
          {busy ? `Running ${busy}...` : statusMessage}
        </p>
      </div>
    </div>
  )
}

function ActionTreePanel({ execution, auditEvents, onSelectNode, selectedNodeId }) {
  const nodes = useMemo(
    () => buildTimelineNodes(execution, auditEvents),
    [execution, auditEvents],
  )

  if (!execution && nodes.length === 0) {
    return (
      <article className="panel tree-panel">
        <div className="tree-shell">
          <div className="tree-legend">
            <span><i className="legend-dot legend-main" /> Main</span>
            <span><i className="legend-dot legend-fork" /> Fork</span>
            <span><i className="legend-dot legend-block" /> Blocked</span>
          </div>
          <div className="action-tree-wrap">
            <div id="actionTreeCanvas" className="action-tree-canvas" data-testid="action-tree-canvas">
              <p className="action-tree-empty">No trace loaded.</p>
            </div>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="panel tree-panel">
      <div className="tree-shell">
        <div className="tree-legend">
          <span><i className="legend-dot legend-main" /> Main</span>
          <span><i className="legend-dot legend-fork" /> Fork</span>
          <span><i className="legend-dot legend-block" /> Blocked</span>
        </div>
        <div className="action-tree-wrap">
          <div id="actionTreeCanvas" className="action-tree-canvas" data-testid="action-tree-canvas">
            <div className="tree-node-flow">
              {nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={`tree-node ${resolveRiskClass(node)} ${selectedNodeId === node.id ? 'selected' : ''} ${String(node.status).includes('block') ? 'blocked' : ''}`}
                  onClick={() => onSelectNode(node)}
                >
                  <span className="tree-node-title">{node.label}</span>
                  <span className="tree-node-meta mono">{node.actor}</span>
                  <span className="tree-node-meta">{node.status}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function TraceInventory({ executions, selectedExecutionId, onSelectExecution }) {
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')

  const filtered = useMemo(() => {
    return executions.filter((execution) => {
      const bySearch =
        !search ||
        execution.executionId.toLowerCase().includes(search.toLowerCase()) ||
        String(execution.sessionId ?? '').toLowerCase().includes(search.toLowerCase())

      const status = String(execution.status ?? '').toLowerCase()
      const riskValue = status.includes('fail') || status.includes('cancel')
        ? 'critical'
        : status.includes('pause')
          ? 'high'
          : status.includes('pending')
            ? 'medium'
            : 'low'
      const byRisk = riskFilter === 'all' || riskValue === riskFilter

      const source = String(execution.source ?? execution.origin ?? 'runtime').toLowerCase()
      const bySource = sourceFilter === 'all' || source.includes(sourceFilter)

      return bySearch && byRisk && bySource
    })
  }, [executions, riskFilter, search, sourceFilter])

  return (
    <article className="panel inventory-panel">
      <div className="panel-head">
        <h2 className="panel-title">Traces</h2>
        <span id="traceCount" className="chip">{filtered.length}</span>
      </div>
      <input
        id="traceSearch"
        className="inventory-search"
        type="search"
        placeholder="Search traces..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search traces"
      />
      <div className="inventory-filter-row">
        <select id="traceRisk" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
          <option value="all">All risk</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select id="traceSource" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
          <option value="all">All sources</option>
          <option value="frontend-b">Frontend B</option>
          <option value="openclaw">OpenClaw</option>
          <option value="runtime">Runtime</option>
        </select>
      </div>
      <div id="traceList" className="trace-list" aria-live="polite">
        {filtered.length === 0 ? <p className="empty-row">No traces loaded.</p> : null}
        {filtered.map((execution) => (
          <button
            key={execution.executionId}
            type="button"
            className={`trace-list-item ${selectedExecutionId === execution.executionId ? 'is-active' : ''}`}
            onClick={() => onSelectExecution(execution.executionId)}
          >
            <strong className="mono">{execution.executionId}</strong>
            <span>{execution.status}</span>
            <span className="mono">{execution.sessionId || 'session-n/a'}</span>
          </button>
        ))}
      </div>
    </article>
  )
}

function RuntimeContextCard({ execution, summary, eventCount }) {
  return (
    <article className="panel session-panel session-compact">
      <div className="panel-head">
        <h2 className="panel-title">Session</h2>
        <span id="sourceBadge" className="source-badge source-unknown">source=frontend-b-runtime</span>
      </div>
      <p id="sourceHint" className="source-hint">
        Frontend A monitors and intervenes on Frontend B orchestration runtime activity.
      </p>
      <dl className="kv-grid kv-grid-inline">
        <div className="kv-row">
          <dt>Trace</dt>
          <dd id="sessionTraceId" className="mono">{execution?.executionId || '-'}</dd>
        </div>
        <div className="kv-row">
          <dt>Session</dt>
          <dd id="sessionSessionId" className="mono">{execution?.sessionId || '-'}</dd>
        </div>
        <div className="kv-row">
          <dt>Event</dt>
          <dd id="sessionLastEvent">{eventCount} observed</dd>
        </div>
        <div className="kv-row">
          <dt>Risk</dt>
          <dd>
            <span id="sessionRiskBadge" className={`risk-badge ${summary.risk === 'High' ? 'risk-high' : summary.risk === 'Medium' ? 'risk-medium' : 'risk-low'}`}>
              {summary.risk}
            </span>
          </dd>
        </div>
        <div className="kv-row">
          <dt>Guard</dt>
          <dd><span id="liveGuardBadge" className="guard-pill">{summary.status}</span></dd>
        </div>
      </dl>
    </article>
  )
}

function useRuntimeData(executionId, sessionId) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [executions, setExecutions] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [approvals, setApprovals] = useState([])

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      setError('')

      try {
        const [executionsResult, eventsResult, approvalsResult] = await Promise.allSettled([
          loadJson('/api/orchestrations/executions?limit=30'),
          loadJson('/api/observability/orchestrations/audit-log?offset=0&limit=40'),
          loadJson('/api/hitl/approvals'),
          loadJson('/api/observability/orchestrations/slo'),
        ])

        if (cancelled) {
          return
        }

        if (executionsResult.status === 'fulfilled') {
          const items = asArray(executionsResult.value)
            .map(executionFromRecord)
            .filter(Boolean)
          setExecutions(filterFrontendBOrigin(items))
        }

        if (eventsResult.status === 'fulfilled') {
          setAuditEvents(filterFrontendBOrigin(asArray(eventsResult.value)))
        }

        if (approvalsResult.status === 'fulfilled') {
          setApprovals(filterFrontendBOrigin(asArray(approvalsResult.value)))
        }
      } catch (requestError) {
        if (!cancelled) {
          const message = requestError instanceof Error ? requestError.message : String(requestError)
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    refresh()
    const intervalId = window.setInterval(refresh, 15000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [executionId, sessionId])

  return {
    loading,
    error,
    executions,
    auditEvents,
    approvals,
  }
}

function ObserveLiveView({ execution, auditEvents, sessionId, onTargetChange }) {
  const [selectedNode, setSelectedNode] = useState(null)

  useEffect(() => {
    setSelectedNode(null)
  }, [execution?.executionId])

  return (
    <section data-view-panel="live" className="view-panel live-view">
      <header className="mw-view-header">
        <h1>Observability & Alerts</h1>
        <p>Monitor Frontend B orchestration runtime and intervene when risk escalates.</p>
      </header>

      <MonitoringContextExplainer
        executionId={execution?.executionId ?? ''}
        sessionId={execution?.sessionId ?? sessionId}
        onTargetSuggestion={onTargetChange}
      />

      <ActionTreePanel
        execution={execution}
        auditEvents={auditEvents}
        selectedNodeId={selectedNode?.id}
        onSelectNode={setSelectedNode}
      />

      <InterventionCommandBar
        compact
        executionId={execution?.executionId ?? ''}
        sessionId={execution?.sessionId ?? sessionId}
        onTargetChange={onTargetChange}
      />

      <NodeActionModal
        open={Boolean(selectedNode)}
        node={selectedNode}
        execution={execution}
        sessionId={sessionId}
        onClose={() => setSelectedNode(null)}
        onTargetChange={onTargetChange}
      />
    </section>
  )
}

function ObserveChatView({ execution, sessionId, routeRecord }) {
  const executionId = String(execution?.executionId ?? '')
  const resolvedSessionId = String(execution?.sessionId ?? sessionId ?? '')
  const [messages, setMessages] = useState(() => [
    {
      id: 'observe-chat-initial',
      role: 'assistant',
      content:
        'Monitoring agent connected. Ask for live firewall posture, risk drift, approvals, or intervention guidance.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const quickPrompts = useMemo(
    () =>
      buildMonitoringQuickPrompts({
        executionId,
        sessionId: resolvedSessionId,
        routeTitle: routeRecord?.title ?? '',
      }),
    [executionId, resolvedSessionId, routeRecord?.title],
  )

  async function sendPrompt(rawPrompt) {
    const prompt = String(rawPrompt ?? '').trim()
    if (!prompt || busy) {
      return
    }

    setBusy(true)
    setError('')
    const requestId = `observe-chat-${Date.now()}`
    const controller = new AbortController()

    setMessages((previous) =>
      trimObserveChatMessages([
        ...previous,
        { id: `${requestId}-user`, role: 'user', content: prompt },
      ]),
    )
    setInput('')

    try {
      const reply = await requestMonitoringChat(prompt, controller.signal)
      setMessages((previous) =>
        trimObserveChatMessages([
          ...previous,
          { id: `${requestId}-assistant`, role: 'assistant', content: reply },
        ]),
      )
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Unable to reach monitoring chat.'
      setError(message)
      setMessages((previous) =>
        trimObserveChatMessages([
          ...previous,
          {
            id: `${requestId}-assistant-error`,
            role: 'assistant',
            content:
              'Monitoring chat is temporarily unavailable. Continue with intervention controls while retrying.',
          },
        ]),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section data-view-panel="chat" className="view-panel observe-chat-view">
      <header className="mw-view-header">
        <h1>Observe Chat</h1>
        <p>Chat with the monitoring agent for live firewall updates and intervention recommendations.</p>
      </header>

      <article className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Monitoring Agent</h2>
          <span className="chip">
            {executionId ? `execution=${executionId}` : resolvedSessionId ? `session=${resolvedSessionId}` : 'target=unselected'}
          </span>
        </div>

        <div className="mw-chat-prompts">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="mw-chat-prompt"
              disabled={busy}
              onClick={() => sendPrompt(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mw-chat-log" role="log" aria-live="polite">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`mw-chat-bubble ${message.role === 'user' ? 'mw-chat-bubble-user' : 'mw-chat-bubble-assistant'}`}
            >
              <p>{message.content}</p>
            </article>
          ))}
        </div>

        <form
          className="mw-chat-form"
          onSubmit={(event) => {
            event.preventDefault()
            sendPrompt(input)
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask for monitoring updates, risk drift, or next intervention..."
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? 'Sending...' : 'Send'}
          </button>
        </form>

        {error ? <p className="mw-chat-error">{error}</p> : null}
      </article>
    </section>
  )
}

function ObserveTimelineView({ auditEvents }) {
  return (
    <section data-view-panel="timeline" className="view-panel timeline-view">
      <header className="mw-view-header">
        <h1>Timeline</h1>
        <p>Ordered Frontend B runtime events for incident triage and intervention sequencing.</p>
      </header>

      <article className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Runtime Event Stream</h2>
          <span className="chip">{auditEvents.length}</span>
        </div>
        {auditEvents.length === 0 ? <p className="empty-row">No B-origin events available.</p> : null}
        <div className="timeline-table-wrap">
          <table className="timeline-table" id="timelineBody">
            <thead>
              <tr>
                <th>Event</th>
                <th>Execution</th>
                <th>Timestamp</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((event, index) => (
                <tr key={event.id ?? `${event.timestamp ?? 'evt'}-${index}`}>
                  <td>{event.eventType ?? event.type ?? event.action ?? 'event'}</td>
                  <td className="mono">{event.executionId ?? event.traceId ?? '-'}</td>
                  <td>{event.timestamp ?? event.createdAt ?? '-'}</td>
                  <td>{event.source ?? event.origin ?? 'runtime'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

function AnalyzeControlView({
  execution,
  executions,
  auditEvents,
  sessionId,
  onSelectExecution,
  onTargetChange,
}) {
  const summary = summarizeExecution(execution, auditEvents)

  return (
    <section data-view-panel="control" className="view-panel control-view">
      <header className="mw-view-header">
        <h1>Audit & Compliance Operations</h1>
        <p>Intervene directly on Frontend B executions with stop, replay, and escalation controls.</p>
      </header>

      <div className="control-split">
        <div className="control-left">
          <TraceInventory
            executions={executions}
            selectedExecutionId={execution?.executionId ?? ''}
            onSelectExecution={onSelectExecution}
          />
          <div className="session-inventory-row">
            <RuntimeContextCard execution={execution} summary={summary} eventCount={auditEvents.length} />
            <article className="panel demo-panel session-compact">
              <div className="panel-head">
                <h2 className="panel-title">Monitoring Context</h2>
                <span className="chip">Live</span>
              </div>
              <p>{summary.recommendation}</p>
            </article>
          </div>
        </div>

        <div className="control-right">
          <InterventionCommandBar
            executionId={execution?.executionId ?? ''}
            sessionId={execution?.sessionId ?? sessionId}
            onTargetChange={onTargetChange}
          />
        </div>
      </div>
    </section>
  )
}

function AnalyzeTopologyView({ auditEvents }) {
  const endpoints = useMemo(() => {
    const seen = new Set()
    const list = []

    for (const event of auditEvents) {
      const host = String(
        event.url ?? event.domain ?? event.host ?? event.destination ?? event.target ?? '',
      ).trim()
      if (!host || seen.has(host)) {
        continue
      }
      seen.add(host)
      list.push({
        host,
        status: String(event.status ?? event.severity ?? 'observed').toLowerCase(),
      })
    }

    return list
  }, [auditEvents])

  return (
    <section data-view-panel="topology" className="view-panel topology-view">
      <header className="mw-view-header">
        <h1>Topology</h1>
        <p>Inspect endpoint requests and runtime network posture from Frontend B traces.</p>
      </header>

      <article className="panel topology-canvas-panel">
        <div id="topologyMap" className="topology-map">
          {endpoints.length === 0 ? <p className="empty-row">No topology data yet.</p> : null}
          {endpoints.map((endpoint) => (
            <article key={endpoint.host} className="topology-endpoint-card">
              <h3 className="mono">{endpoint.host}</h3>
              <p>Status: {endpoint.status}</p>
            </article>
          ))}
        </div>
      </article>
    </section>
  )
}

function GovernGuardView({ execution, sessionId, approvals, onTargetChange }) {
  return (
    <section data-view-panel="guard" className="view-panel guard-view">
      <header className="mw-view-header">
        <h1>Guardrails</h1>
        <p>Operate approvals, escalations, and stop controls over live Frontend B executions.</p>
      </header>

      <InterventionCommandBar
        executionId={execution?.executionId ?? ''}
        sessionId={execution?.sessionId ?? sessionId}
        onTargetChange={onTargetChange}
      />

      <article className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Pending Approvals</h2>
          <span className="chip">{approvals.length}</span>
        </div>
        {approvals.length === 0 ? <p className="empty-row">No pending approvals.</p> : null}
        <ul className="mw-simple-list">
          {approvals.map((approval, index) => (
            <li key={approval.approvalId ?? approval.id ?? `approval-${index}`}>
              <strong>{approval.approvalId ?? approval.id ?? 'approval'}</strong> on{' '}
              <span className="mono">{approval.executionId ?? '-'}</span>
            </li>
          ))}
        </ul>
      </article>
    </section>
  )
}

function GovernForkView({ execution, auditEvents }) {
  return (
    <section data-view-panel="fork" className="view-panel fork-view">
      <header className="mw-view-header">
        <h1>Fork Insights</h1>
        <p>Review replay branches and investigate remediation paths before resume/cancel decisions.</p>
      </header>

      <article className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Fork Guidance</h2>
        </div>
        <p>
          Use <code>replay-from-node</code> when a safe branch is available. Use <code>retry-node</code> when
          the original branch should continue after mitigation.
        </p>
        <p>
          Current execution: <span className="mono">{execution?.executionId ?? '-'}</span>
        </p>
        <p>Observed runtime events: {auditEvents.length}</p>
      </article>
    </section>
  )
}

function AdminSettingsView({ execution, sessionId, onTargetChange }) {
  return (
    <section data-view-panel="settings" className="view-panel settings-view">
      <header className="mw-view-header">
        <h1>Settings</h1>
        <p>Operator controls for runtime intervention workflow and authentication posture.</p>
      </header>
      <InterventionCommandBar
        compact
        executionId={execution?.executionId ?? ''}
        sessionId={execution?.sessionId ?? sessionId}
        onTargetChange={onTargetChange}
      />
    </section>
  )
}

function AdminPolicyView() {
  return (
    <section data-view-panel="policy" className="view-panel policy-view">
      <header className="mw-view-header">
        <h1>Policy Operations</h1>
        <p>Review policy references that govern intervention pathways and operator actions.</p>
      </header>
      <article className="panel">
        <ul className="mw-simple-list">
          <li>Destructive actions require confirmation and reason capture.</li>
          <li>Step-up challenge/verify is mandatory when backend requests elevated assurance.</li>
          <li>Escalation and break-glass operations must be auditable and reversible where possible.</li>
        </ul>
      </article>
    </section>
  )
}

function AdminMarketplaceView() {
  return (
    <section data-view-panel="marketplace" className="view-panel marketplace-view">
      <header className="mw-view-header">
        <h1>Marketplace</h1>
        <p>Connected integrations and downstream runtime adapters used by orchestration monitoring.</p>
      </header>
      <article className="panel">
        <p>Integrations remain available through existing admin and downstream APIs.</p>
      </article>
    </section>
  )
}

function DocsWorkspaceView({ docsView, routeRecord }) {
  const apiEndpoints = routeRecord?.apiEndpoints ?? []
  const anchors = routeRecord?.anchors ?? []
  const routeCatalogByCategory = MAPLE_WORKSPACE_CATEGORIES
    .filter((category) => category.id !== 'docs')
    .map((category) => ({
      ...category,
      routes: MAPLE_ROUTE_REGISTRY.filter((route) => route.category === category.id),
    }))
  const allOpsEndpoints = Array.from(
    new Set(MAPLE_ROUTE_REGISTRY.flatMap((route) => route.apiEndpoints)),
  ).sort()
  const allRouteAnchorCoverage = MAPLE_ROUTE_REGISTRY.map((route) => ({
    path: route.path,
    title: route.title,
    anchors: route.anchors,
  }))

  if (docsView === 'api') {
    return (
      <section className="view-panel docs-view">
        <header className="mw-view-header">
          <h1>Docs: API</h1>
          <p>Full API inventory for Mayple operations routes and legacy Frontend A references.</p>
        </header>

        <article className="panel">
          <h2>Active Route Endpoints</h2>
          <ul className="mw-simple-list">
            {apiEndpoints.length === 0 ? <li>No route endpoints registered.</li> : null}
            {apiEndpoints.map((endpoint) => (
              <li key={endpoint}>
                <code>{endpoint}</code>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Mayple Operations Endpoint Inventory</h2>
          <ul className="mw-simple-list">
            {allOpsEndpoints.map((endpoint) => (
              <li key={endpoint}>
                <code>{endpoint}</code>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Legacy Protocol API Coverage</h2>
          <ul className="mw-simple-list">
            {LEGACY_PROTOCOL_ENDPOINTS.map((endpoint) => (
              <li key={endpoint}>
                <code>{endpoint}</code>
              </li>
            ))}
          </ul>
        </article>
      </section>
    )
  }

  if (docsView === 'runbooks') {
    return (
      <section className="view-panel docs-view">
        <header className="mw-view-header">
          <h1>Docs: Runbooks</h1>
          <p>Operational runbooks for monitoring and intervention in Frontend A.</p>
        </header>

        <article className="panel">
          <h2>Incident Response Sequence</h2>
          <ol className="mw-simple-list">
            <li>Pause execution to stop blast radius.</li>
            <li>Inspect monitoring context, node details, and pending approvals.</li>
            <li>Retry node or replay from node to recover deterministic path.</li>
            <li>Resume execution when stable, or cancel with explicit reason if unsafe.</li>
            <li>Escalate and trigger break-glass when policy/impact demands responder takeover.</li>
            <li>Complete step-up challenge/verify whenever backend requests elevated assurance.</li>
          </ol>
        </article>

        <article className="panel">
          <h2>Intervention Action Reference</h2>
          <ul className="mw-simple-list">
            {INTERVENTION_ACTION_REFERENCE.map((action) => (
              <li key={action.label}>
                <strong>{action.label}</strong>: <code>{action.endpoint}</code>. {action.guidance}
                {action.destructive ? ' Destructive action path requires confirm + reason.' : ''}
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Role Split Reminder</h2>
          <ul className="mw-simple-list">
            <li>Frontend B owns orchestration authoring and execution runtime.</li>
            <li>Frontend A owns monitoring, stop controls, and intervention command workflows.</li>
            <li>Monitoring datasets in Frontend A must remain Frontend B-origin scoped.</li>
          </ul>
        </article>
      </section>
    )
  }

  if (docsView === 'route-help') {
    return (
      <section className="view-panel docs-view">
        <header className="mw-view-header">
          <h1>Docs: Route Help</h1>
          <p>Contextual help for {routeRecord?.title ?? 'this route'} with complete route anchor coverage.</p>
        </header>

        <article className="panel">
          <h2>Current Route Summary</h2>
          <p>{routeRecord?.description ?? 'No route help available.'}</p>
          <p>
            Route path: <code>{routeRecord?.path ?? '-'}</code>
          </p>
          <h3>Current Route Anchors</h3>
          <ul className="mw-simple-list">
            {anchors.length === 0 ? <li>No anchors registered.</li> : null}
            {anchors.map((anchor) => (
              <li key={anchor.id}>
                <a href={`${routeRecord?.path ?? '/maple'}#${anchor.id}`}>{anchor.title}</a>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>All Mayple Route Anchors</h2>
          <ul className="mw-simple-list">
            {allRouteAnchorCoverage.map((entry) => (
              <li key={entry.path}>
                <strong>{entry.title}</strong> (<code>{entry.path}</code>)
                {entry.anchors.length === 0 ? ': no registered anchors.' : null}
                {entry.anchors.length > 0 ? (
                  <span>
                    {': '}
                    {entry.anchors.map((anchor) => anchor.title).join(', ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Legacy Documentation Pages</h2>
          <ul className="mw-simple-list">
            {LEGACY_DOC_PAGES.map((docPage) => (
              <li key={docPage.path}>
                <a href={docPage.path}>{docPage.title}</a> - {docPage.description}
              </li>
            ))}
          </ul>
        </article>
      </section>
    )
  }

  return (
    <section className="view-panel docs-view">
      <header className="mw-view-header">
        <h1>Docs: Overview</h1>
        <p>Complete documentation index for operations, APIs, runbooks, and legacy Frontend A guides.</p>
      </header>

      <article className="panel">
        <h2>Frontend Role Split</h2>
        <ul className="mw-simple-list">
          <li>Frontend B: orchestration authoring and execution runtime.</li>
          <li>Frontend A: monitoring, stop controls, and intervention command center.</li>
          <li>Source badge in operations views confirms B-origin runtime context.</li>
        </ul>
      </article>

      <article className="panel">
        <h2>Mayple Route Catalog</h2>
        <ul className="mw-simple-list">
          {routeCatalogByCategory.map((category) => (
            <li key={category.id}>
              <strong>{category.label}</strong>: {category.description}
              <ul className="mw-simple-list">
                {category.routes.map((route) => (
                  <li key={route.path}>
                    <code>{route.path}</code> - {route.title}: {route.description}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </article>

      <article className="panel">
        <h2>Legacy Frontend A Docs Index</h2>
        <ul className="mw-simple-list">
          {LEGACY_DOC_PAGES.map((docPage) => (
            <li key={docPage.path}>
              <a href={docPage.path}>{docPage.title}</a> - {docPage.description}
              <ul className="mw-simple-list">
                {docPage.sections.map((section) => (
                  <li key={`${docPage.path}-${section}`}>{section}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </article>

      <article className="panel">
        <h2>Section Coverage Sources</h2>
        <p>
          Docs content combines route metadata, all registered anchors from <code>allSections</code>, and
          legacy guide pages from the prior Frontend A documentation surface.
        </p>
        <p>Registered section groups: {Object.keys(allSections).length}</p>
      </article>
    </section>
  )
}

export function WorkspaceViewHost({
  category,
  view,
  routeRecord,
  executionId,
  sessionId,
  onTargetChange,
}) {
  const { loading, error, executions, auditEvents, approvals } = useRuntimeData(executionId, sessionId)

  const activeExecution = useMemo(() => {
    if (executionId) {
      const matched = executions.find((execution) => execution.executionId === executionId)
      if (matched) {
        return matched
      }
    }
    return executions[0] ?? null
  }, [executionId, executions])

  useEffect(() => {
    if (!activeExecution) {
      return
    }
    if (activeExecution.executionId === executionId && activeExecution.sessionId === sessionId) {
      return
    }
    onTargetChange?.({
      executionId: activeExecution.executionId,
      sessionId: activeExecution.sessionId,
    })
  }, [activeExecution, executionId, onTargetChange, sessionId])

  const handleSelectExecution = (nextExecutionId) => {
    const selected = executions.find((execution) => execution.executionId === nextExecutionId)
    if (!selected) {
      return
    }
    onTargetChange?.({
      executionId: selected.executionId,
      sessionId: selected.sessionId,
    })
  }

  if (loading && executions.length === 0 && auditEvents.length === 0) {
    return <p className="empty-row">Loading runtime workspace...</p>
  }

  if (error) {
    return <p className="empty-row">{error}</p>
  }

  if (category === 'docs') {
    return <DocsWorkspaceView docsView={view} routeRecord={routeRecord} />
  }

  if (category === 'observe' && view === 'timeline') {
    return <ObserveTimelineView auditEvents={auditEvents} />
  }

  if (category === 'observe' && view === 'chat') {
    return (
      <ObserveChatView
        execution={activeExecution}
        sessionId={sessionId}
        routeRecord={routeRecord}
      />
    )
  }

  if (category === 'observe') {
    return (
      <ObserveLiveView
        execution={activeExecution}
        auditEvents={auditEvents}
        sessionId={sessionId}
        onTargetChange={onTargetChange}
      />
    )
  }

  if (category === 'analyze' && view === 'topology') {
    return <AnalyzeTopologyView auditEvents={auditEvents} />
  }

  if (category === 'analyze') {
    return (
      <AnalyzeControlView
        execution={activeExecution}
        executions={executions}
        auditEvents={auditEvents}
        sessionId={sessionId}
        onSelectExecution={handleSelectExecution}
        onTargetChange={onTargetChange}
      />
    )
  }

  if (category === 'govern' && view === 'fork') {
    return <GovernForkView execution={activeExecution} auditEvents={auditEvents} />
  }

  if (category === 'govern') {
    return (
      <GovernGuardView
        execution={activeExecution}
        sessionId={sessionId}
        approvals={approvals}
        onTargetChange={onTargetChange}
      />
    )
  }

  if (category === 'admin' && view === 'policy') {
    return <AdminPolicyView />
  }

  if (category === 'admin' && view === 'marketplace') {
    return <AdminMarketplaceView />
  }

  return (
    <AdminSettingsView
      execution={activeExecution}
      sessionId={sessionId}
      onTargetChange={onTargetChange}
    />
  )
}
