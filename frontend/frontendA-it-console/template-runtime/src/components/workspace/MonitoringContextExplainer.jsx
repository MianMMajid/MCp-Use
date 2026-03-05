'use client'

import { useEffect, useMemo, useState } from 'react'

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

function resolveRiskLabel(summary, events) {
  const failed = Number(summary?.byStatus?.failed ?? 0)
  const pending = Number(summary?.approvalsPending ?? 0)
  const warningEvents = events.filter((event) => {
    const severity = String(event.severity ?? event.status ?? '').toLowerCase()
    return severity.includes('warn') || severity.includes('error') || severity.includes('critical')
  }).length

  const score = failed * 3 + pending * 2 + warningEvents
  if (score >= 8) return 'High'
  if (score >= 4) return 'Medium'
  return 'Low'
}

function buildRecommendations({ summary, filteredEvents }) {
  const recommendations = []
  const pending = Number(summary?.approvalsPending ?? 0)
  const failed = Number(summary?.byStatus?.failed ?? 0)
  const active = Number(summary?.activeExecutions ?? 0)

  if (pending > 0) {
    recommendations.push('Process pending approvals before resuming blocked executions.')
  }
  if (failed > 0) {
    recommendations.push('Inspect failed nodes and use retry/replay before relaunching.')
  }
  if (active > 0 && filteredEvents.length > 0) {
    recommendations.push('Use pause/cancel controls only on impacted execution IDs.')
  }
  if (recommendations.length === 0) {
    recommendations.push('Runtime posture is stable. Continue monitoring for drift.')
  }
  return recommendations
}

export function MonitoringContextExplainer({ executionId = '', sessionId = '', onTargetSuggestion }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [auditEvents, setAuditEvents] = useState([])
  const [approvals, setApprovals] = useState([])

  useEffect(() => {
    let cancelled = false

    async function fetchContext() {
      setLoading(true)
      setError('')
      try {
        const [summaryResult, auditResult, approvalsResult] = await Promise.allSettled([
          loadJson('/api/observability/orchestrations/summary'),
          loadJson('/api/observability/orchestrations/audit-log?offset=0&limit=20'),
          loadJson('/api/hitl/approvals'),
        ])

        if (cancelled) {
          return
        }

        if (summaryResult.status === 'fulfilled') {
          setSummary(summaryResult.value)
        }
        if (auditResult.status === 'fulfilled') {
          const items = Array.isArray(auditResult.value?.items)
            ? auditResult.value.items
            : Array.isArray(auditResult.value)
              ? auditResult.value
              : []
          setAuditEvents(items)
        }
        if (approvalsResult.status === 'fulfilled') {
          const items = Array.isArray(approvalsResult.value?.approvals)
            ? approvalsResult.value.approvals
            : Array.isArray(approvalsResult.value?.items)
              ? approvalsResult.value.items
              : Array.isArray(approvalsResult.value)
                ? approvalsResult.value
                : []
          setApprovals(items)
        }

        const firstTarget = [auditResult, approvalsResult]
          .map((result) => (result.status === 'fulfilled' ? result.value : null))
          .find(Boolean)
        if (firstTarget && onTargetSuggestion && !executionId && !sessionId) {
          const auditItem =
            (Array.isArray(firstTarget?.items) && firstTarget.items[0]) ||
            (Array.isArray(firstTarget?.approvals) && firstTarget.approvals[0]) ||
            null
          if (auditItem) {
            onTargetSuggestion({
              executionId:
                auditItem.executionId ??
                auditItem.execution_id ??
                auditItem.orchestrationExecutionId ??
                '',
              sessionId: auditItem.sessionId ?? auditItem.session_id ?? '',
            })
          }
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

    fetchContext()
    const intervalId = window.setInterval(fetchContext, 15000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [executionId, onTargetSuggestion, sessionId])

  const filteredEvents = useMemo(() => filterFrontendBOrigin(auditEvents), [auditEvents])
  const filteredApprovals = useMemo(() => filterFrontendBOrigin(approvals), [approvals])
  const riskLabel = resolveRiskLabel(summary, filteredEvents)
  const recommendations = buildRecommendations({ summary, filteredEvents })

  return (
    <section className="mw-context-explainer" data-testid="monitoring-context-explainer">
      <header className="mw-context-explainer-head">
        <h2>Monitoring Context</h2>
        <span className="mw-source-badge">Source: Frontend B orchestration runtime</span>
      </header>

      {loading ? <p className="mw-context-explainer-muted">Loading monitoring context...</p> : null}
      {error ? <p className="mw-context-explainer-error">{error}</p> : null}

      <div className="mw-context-explainer-grid">
        <article>
          <h3>Execution State</h3>
          <p>
            Active executions: <strong>{summary?.activeExecutions ?? 0}</strong>
          </p>
          <p>
            Pending approvals: <strong>{summary?.approvalsPending ?? filteredApprovals.length}</strong>
          </p>
        </article>
        <article>
          <h3>Risk Posture</h3>
          <p>
            Current risk: <strong>{riskLabel}</strong>
          </p>
          <p>
            Filtered audit events: <strong>{filteredEvents.length}</strong>
          </p>
        </article>
        <article>
          <h3>Escalation Signals</h3>
          <p>
            Failed executions: <strong>{summary?.byStatus?.failed ?? 0}</strong>
          </p>
          <p>
            Canceled executions: <strong>{summary?.byStatus?.canceled ?? 0}</strong>
          </p>
        </article>
      </div>

      <section className="mw-context-explainer-reco">
        <h3>Recommended Intervention Path</h3>
        <ul>
          {recommendations.map((recommendation) => (
            <li key={recommendation}>{recommendation}</li>
          ))}
        </ul>
      </section>
    </section>
  )
}
