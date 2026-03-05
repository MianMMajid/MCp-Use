'use client'

import { useEffect, useState } from 'react'

import { MonitoringContextExplainer } from './MonitoringContextExplainer'
import { InterventionCommandBar } from './InterventionCommandBar'
import ObsAuditLog from '../../app/maple/observability/ObsAuditLog'
import ObsSlo from '../../app/maple/observability/ObsSlo'
import ObsSummary from '../../app/maple/observability/ObsSummary'
import ObsWebhooks from '../../app/maple/observability/ObsWebhooks'
import { filterFrontendBOrigin } from '../../lib/maple-workspace/origin-filter.js'

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

function InfoCard({ title, children }) {
  return (
    <article className="mw-view-card">
      <h3>{title}</h3>
      <div>{children}</div>
    </article>
  )
}

function ObserveLiveView({ executionId, sessionId, onTargetChange }) {
  return (
    <div className="mw-view-stack">
      <header>
        <h1>Observability & Alerts</h1>
        <p>Monitor Frontend B orchestration runtime and intervene when risk escalates.</p>
      </header>
      <MonitoringContextExplainer
        executionId={executionId}
        sessionId={sessionId}
        onTargetSuggestion={onTargetChange}
      />
      <InterventionCommandBar
        compact
        executionId={executionId}
        sessionId={sessionId}
        onTargetChange={onTargetChange}
      />
      <ObsSummary />
      <ObsSlo />
      <ObsAuditLog />
      <ObsWebhooks />
    </div>
  )
}

function ObserveTimelineView({ executionId, sessionId, onTargetChange }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function fetchEvents() {
      setLoading(true)
      setError('')
      try {
        const payload = await loadJson('/api/observability/orchestrations/audit-log?offset=0&limit=40')
        if (!cancelled) {
          const items = Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload)
              ? payload
              : []
          setEvents(filterFrontendBOrigin(items))
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : String(requestError))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    fetchEvents()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mw-view-stack">
      <header>
        <h1>Timeline</h1>
        <p>Ordered Frontend B runtime events for incident triage.</p>
      </header>
      <InterventionCommandBar
        compact
        executionId={executionId}
        sessionId={sessionId}
        onTargetChange={onTargetChange}
      />
      <InfoCard title="Event Stream">
        {loading ? <p>Loading timeline...</p> : null}
        {error ? <p className="mw-intervention-error">{error}</p> : null}
        {!loading && !error ? (
          <ul className="mw-simple-list">
            {events.length === 0 ? <li>No B-origin events available.</li> : null}
            {events.map((event, index) => (
              <li key={event.id ?? `${event.timestamp ?? 'evt'}-${index}`}>
                <strong>{event.eventType ?? event.type ?? 'event'}</strong>
                <span>{event.timestamp ?? event.createdAt ?? '-'}</span>
                <span>{event.executionId ?? event.traceId ?? '-'}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </InfoCard>
    </div>
  )
}

function AnalyzeControlView({ executionId, sessionId, onTargetChange }) {
  return (
    <div className="mw-view-stack">
      <header>
        <h1>Audit & Compliance Operations</h1>
        <p>Intervene directly on live orchestration executions from Frontend B runtime.</p>
      </header>
      <MonitoringContextExplainer
        executionId={executionId}
        sessionId={sessionId}
        onTargetSuggestion={onTargetChange}
      />
      <InterventionCommandBar
        executionId={executionId}
        sessionId={sessionId}
        onTargetChange={onTargetChange}
      />
    </div>
  )
}

function AnalyzeTopologyView() {
  return (
    <div className="mw-view-stack">
      <header>
        <h1>Topology</h1>
        <p>View endpoint and orchestration topology inferred from Frontend B traces.</p>
      </header>
      <InfoCard title="Topology Status">
        <p>Endpoint topology remains available via monitoring APIs and downstream MCP links.</p>
      </InfoCard>
    </div>
  )
}

function GovernGuardView({ executionId, sessionId, onTargetChange }) {
  return (
    <div className="mw-view-stack">
      <header>
        <h1>Guardrails</h1>
        <p>Apply governance controls and escalation paths for active orchestration incidents.</p>
      </header>
      <InterventionCommandBar
        executionId={executionId}
        sessionId={sessionId}
        onTargetChange={onTargetChange}
      />
    </div>
  )
}

function GovernForkView() {
  return (
    <div className="mw-view-stack">
      <header>
        <h1>Fork Insights</h1>
        <p>Analyze replay/fork behavior and evaluate remediation impact.</p>
      </header>
      <InfoCard title="Fork Guidance">
        <p>Use replay-from-node and retry-node actions from the command bar to test remediations.</p>
      </InfoCard>
    </div>
  )
}

function AdminSettingsView() {
  return (
    <div className="mw-view-stack">
      <header>
        <h1>Settings</h1>
        <p>Configure credentials, billing, and account controls for monitoring operators.</p>
      </header>
    </div>
  )
}

function AdminPolicyView() {
  return (
    <div className="mw-view-stack">
      <header>
        <h1>Policy Operations</h1>
        <p>Review policy references that govern intervention pathways.</p>
      </header>
    </div>
  )
}

function AdminMarketplaceView() {
  return (
    <div className="mw-view-stack">
      <header>
        <h1>Marketplace</h1>
        <p>Manage connected integrations and downstream applications used by orchestration runtime.</p>
      </header>
    </div>
  )
}

function DocsWorkspaceView({ docsView, routeRecord }) {
  const apiEndpoints = routeRecord?.apiEndpoints ?? []
  const anchors = routeRecord?.anchors ?? []

  if (docsView === 'api') {
    return (
      <div className="mw-view-stack">
        <header>
          <h1>Docs: API</h1>
          <p>Endpoint references used by monitoring and intervention surfaces.</p>
        </header>
        <InfoCard title="Contextual Endpoint List">
          <ul className="mw-simple-list">
            {apiEndpoints.length === 0 ? <li>No route endpoints registered.</li> : null}
            {apiEndpoints.map((endpoint) => (
              <li key={endpoint}>
                <code>{endpoint}</code>
              </li>
            ))}
          </ul>
        </InfoCard>
      </div>
    )
  }

  if (docsView === 'runbooks') {
    return (
      <div className="mw-view-stack">
        <header>
          <h1>Docs: Runbooks</h1>
          <p>Incident response flow for runtime intervention.</p>
        </header>
        <InfoCard title="Standard Incident Flow">
          <ol className="mw-simple-list">
            <li>Pause execution to stop blast radius.</li>
            <li>Inspect failed node and approvals.</li>
            <li>Retry node or replay from node.</li>
            <li>Resume execution if posture is stable.</li>
            <li>Cancel execution and escalate if unresolved.</li>
          </ol>
        </InfoCard>
      </div>
    )
  }

  if (docsView === 'route-help') {
    return (
      <div className="mw-view-stack">
        <header>
          <h1>Docs: Route Help</h1>
          <p>Contextual help for the currently selected route.</p>
        </header>
        <InfoCard title={routeRecord?.title ?? 'Current route'}>
          <p>{routeRecord?.description ?? 'No route description available.'}</p>
          <ul className="mw-simple-list">
            {anchors.length === 0 ? <li>No section anchors available.</li> : null}
            {anchors.map((anchor) => (
              <li key={anchor.id}>{anchor.title}</li>
            ))}
          </ul>
        </InfoCard>
      </div>
    )
  }

  return (
    <div className="mw-view-stack">
      <header>
        <h1>Docs: Overview</h1>
        <p>Frontend A is monitoring + intervention. Frontend B is authoring + execution.</p>
      </header>
      <InfoCard title="Role Split">
        <ul className="mw-simple-list">
          <li>Frontend B runs orchestration authoring and execution workflows.</li>
          <li>Frontend A monitors runtime, triages incidents, and intervenes.</li>
          <li>Monitoring dataset is strict Frontend B orchestration runtime activity.</li>
        </ul>
      </InfoCard>
      <InfoCard title="Intervention Rules">
        <ul className="mw-simple-list">
          <li>Use reasoned confirms for cancel/break-glass/reject actions.</li>
          <li>If step-up is required, request and verify challenge token first.</li>
          <li>Keep command decisions scoped to the selected execution/session target.</li>
        </ul>
      </InfoCard>
    </div>
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
  if (category === 'docs') {
    return <DocsWorkspaceView docsView={view} routeRecord={routeRecord} />
  }

  const key = `${category}/${view}`
  switch (key) {
    case 'observe/live':
      return (
        <ObserveLiveView
          executionId={executionId}
          sessionId={sessionId}
          onTargetChange={onTargetChange}
        />
      )
    case 'observe/timeline':
      return (
        <ObserveTimelineView
          executionId={executionId}
          sessionId={sessionId}
          onTargetChange={onTargetChange}
        />
      )
    case 'analyze/control':
      return (
        <AnalyzeControlView
          executionId={executionId}
          sessionId={sessionId}
          onTargetChange={onTargetChange}
        />
      )
    case 'analyze/topology':
      return <AnalyzeTopologyView />
    case 'govern/guard':
      return (
        <GovernGuardView
          executionId={executionId}
          sessionId={sessionId}
          onTargetChange={onTargetChange}
        />
      )
    case 'govern/fork':
      return <GovernForkView />
    case 'admin/settings':
      return <AdminSettingsView />
    case 'admin/policy':
      return <AdminPolicyView />
    case 'admin/marketplace':
      return <AdminMarketplaceView />
    default:
      return (
        <ObserveLiveView
          executionId={executionId}
          sessionId={sessionId}
          onTargetChange={onTargetChange}
        />
      )
  }
}
