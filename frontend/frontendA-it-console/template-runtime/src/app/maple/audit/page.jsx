'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Audit events', id: 'audit-events' },
  { title: 'Trace browser', id: 'trace-browser' },
  { title: 'Trace search', id: 'trace-search' },
  { title: 'Compliance', id: 'compliance' },
  { title: 'Runs', id: 'runs' },
  { title: 'Audit chain', id: 'audit-chain' },
  { title: 'Retention', id: 'retention' },
  { title: 'Dead letter', id: 'dead-letter' },
]

/* ------------------------------------------------------------------ */
/*  Fetch helpers                                                      */
/* ------------------------------------------------------------------ */

async function loadJson(path) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

/* ------------------------------------------------------------------ */
/*  Skeletons                                                          */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700"
          >
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Severity tag helper                                                */
/* ------------------------------------------------------------------ */

function severityColor(severity) {
  switch (severity?.toLowerCase()) {
    case 'critical':
    case 'error':
      return 'rose'
    case 'warning':
    case 'warn':
      return 'amber'
    case 'info':
      return 'sky'
    default:
      return 'zinc'
  }
}

/* ------------------------------------------------------------------ */
/*  Tab bar                                                            */
/* ------------------------------------------------------------------ */

const TABS = [
  { key: 'audit', label: 'Audit Events' },
  { key: 'traces', label: 'Trace Browser' },
  { key: 'trace-search', label: 'Trace Search' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'runs', label: 'Runs' },
  { key: 'audit-chain', label: 'Audit Chain' },
  { key: 'retention', label: 'Retention' },
  { key: 'dead-letter', label: 'Dead Letter' },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AuditTracesPage() {
  const [activeTab, setActiveTab] = useState('audit')

  // -- Audit state --
  const [auditEvents, setAuditEvents] = useState(null)
  const [auditCursor, setAuditCursor] = useState(null)
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditError, setAuditError] = useState(null)
  const [auditFilter, setAuditFilter] = useState('')
  const [schemas, setSchemas] = useState(null)
  const [exporting, setExporting] = useState(false)

  // -- Traces state --
  const [traces, setTraces] = useState(null)
  const [tracesLoading, setTracesLoading] = useState(false)
  const [tracesError, setTracesError] = useState(null)
  const [expandedTraceId, setExpandedTraceId] = useState(null)
  const [traceDetail, setTraceDetail] = useState(null)
  const [traceDetailLoading, setTraceDetailLoading] = useState(false)

  // -- Trace search state --
  const [traceSearchQuery, setTraceSearchQuery] = useState('')
  const [traceSearchService, setTraceSearchService] = useState('')
  const [traceSearchResults, setTraceSearchResults] = useState(null)
  const [traceSearchLoading, setTraceSearchLoading] = useState(false)
  const [traceSearchError, setTraceSearchError] = useState(null)
  const [traceExporting, setTraceExporting] = useState(false)
  const [traceClearing, setTraceClearing] = useState(false)

  // -- Compliance state --
  const [reports, setReports] = useState(null)
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState(null)
  const [complianceSummary, setComplianceSummary] = useState(null)
  const [generatingReport, setGeneratingReport] = useState(false)

  // -- Runs state --
  const [runs, setRuns] = useState(null)
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState(null)
  const [expandedRunId, setExpandedRunId] = useState(null)
  const [runDetail, setRunDetail] = useState(null)
  const [runTimeline, setRunTimeline] = useState(null)
  const [runDetailLoading, setRunDetailLoading] = useState(false)

  // -- Audit chain state --
  const [auditChain, setAuditChain] = useState(null)
  const [auditChainLoading, setAuditChainLoading] = useState(false)
  const [auditChainError, setAuditChainError] = useState(null)
  const [verifyResult, setVerifyResult] = useState(null)
  const [verifying, setVerifying] = useState(false)

  // -- Retention state --
  const [retention, setRetention] = useState(null)
  const [retentionLoading, setRetentionLoading] = useState(false)
  const [retentionError, setRetentionError] = useState(null)
  const [retentionInput, setRetentionInput] = useState('')
  const [retentionMsg, setRetentionMsg] = useState(null)
  const [enforcing, setEnforcing] = useState(false)

  // -- Dead-letter state --
  const [deadLetterItems, setDeadLetterItems] = useState(null)
  const [deadLetterLoading, setDeadLetterLoading] = useState(false)
  const [deadLetterError, setDeadLetterError] = useState(null)
  const [replayingId, setReplayingId] = useState(null)

  /* ---- Audit fetchers ---- */
  const fetchAudit = useCallback(
    async (cursor) => {
      setAuditLoading(true)
      setAuditError(null)
      try {
        const params = new URLSearchParams()
        if (cursor) params.set('cursor', cursor)
        if (auditFilter) params.set('filter', auditFilter)
        const qs = params.toString()
        const data = await loadJson(`/admin/api/audit${qs ? `?${qs}` : ''}`)
        const events = Array.isArray(data)
          ? data
          : data.events ?? data.items ?? []
        setAuditEvents((prev) =>
          cursor && prev ? [...prev, ...events] : events,
        )
        setAuditCursor(data.nextCursor ?? data.cursor ?? null)
      } catch (err) {
        setAuditError(err.message)
      } finally {
        setAuditLoading(false)
      }
    },
    [auditFilter],
  )

  const fetchSchemas = useCallback(async () => {
    try {
      const data = await loadJson('/admin/api/audit/schemas')
      setSchemas(Array.isArray(data) ? data : data.schemas ?? [])
    } catch {
      // non-critical
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAudit()
      fetchSchemas()
    }
  }, [activeTab, fetchAudit, fetchSchemas])

  async function handleExport() {
    setExporting(true)
    try {
      await postJson('/admin/api/audit/export', { filter: auditFilter || undefined })
    } catch {
      // best-effort
    } finally {
      setExporting(false)
    }
  }

  /* ---- Traces fetchers ---- */
  const fetchTraces = useCallback(async () => {
    setTracesLoading(true)
    setTracesError(null)
    try {
      const data = await loadJson('/api/traces')
      setTraces(Array.isArray(data) ? data : data.traces ?? data.items ?? [])
    } catch (err) {
      setTracesError(err.message)
    } finally {
      setTracesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'traces') fetchTraces()
  }, [activeTab, fetchTraces])

  async function fetchTraceDetail(traceId) {
    if (expandedTraceId === traceId) {
      setExpandedTraceId(null)
      setTraceDetail(null)
      return
    }
    setExpandedTraceId(traceId)
    setTraceDetailLoading(true)
    try {
      const data = await loadJson(`/api/traces/${traceId}`)
      setTraceDetail(data)
    } catch {
      setTraceDetail(null)
    } finally {
      setTraceDetailLoading(false)
    }
  }

  /* ---- Trace search fetchers ---- */
  async function handleTraceSearch() {
    setTraceSearchLoading(true)
    setTraceSearchError(null)
    try {
      const params = new URLSearchParams()
      if (traceSearchQuery) params.set('q', traceSearchQuery)
      if (traceSearchService) params.set('service', traceSearchService)
      const qs = params.toString()
      const data = await loadJson(`/api/traces/search${qs ? `?${qs}` : ''}`)
      setTraceSearchResults(
        Array.isArray(data) ? data : data.traces ?? data.results ?? data.items ?? [],
      )
    } catch (err) {
      setTraceSearchError(err.message)
    } finally {
      setTraceSearchLoading(false)
    }
  }

  async function handleTraceExport() {
    setTraceExporting(true)
    try {
      await postJson('/api/traces/export', {
        query: traceSearchQuery || undefined,
        service: traceSearchService || undefined,
      })
    } catch {
      // best-effort
    } finally {
      setTraceExporting(false)
    }
  }

  async function handleTraceClear() {
    if (!confirm('Clear all traces? This cannot be undone.')) return
    setTraceClearing(true)
    try {
      await postJson('/api/traces/clear', {})
      setTraces([])
      setTraceSearchResults(null)
    } catch {
      // best-effort
    } finally {
      setTraceClearing(false)
    }
  }

  /* ---- Compliance fetchers ---- */
  const fetchReports = useCallback(async () => {
    setReportsLoading(true)
    setReportsError(null)
    try {
      const [r, s] = await Promise.allSettled([
        loadJson('/admin/api/compliance/reports'),
        loadJson('/api/openclaw/modifier/ops/compliance/summary'),
      ])
      if (r.status === 'fulfilled')
        setReports(Array.isArray(r.value) ? r.value : r.value.reports ?? [])
      if (s.status === 'fulfilled') setComplianceSummary(s.value)
    } catch (err) {
      setReportsError(err.message)
    } finally {
      setReportsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'compliance') fetchReports()
  }, [activeTab, fetchReports])

  async function handleGenerateReport() {
    setGeneratingReport(true)
    try {
      await postJson('/api/openclaw/modifier/ops/compliance/report', {})
      fetchReports()
    } catch {
      // best-effort
    } finally {
      setGeneratingReport(false)
    }
  }

  /* ---- Runs fetchers ---- */
  const fetchRuns = useCallback(async () => {
    setRunsLoading(true)
    setRunsError(null)
    try {
      const data = await loadJson('/api/runs')
      setRuns(Array.isArray(data) ? data : data.runs ?? data.items ?? [])
    } catch (err) {
      setRunsError(err.message)
    } finally {
      setRunsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'runs') fetchRuns()
  }, [activeTab, fetchRuns])

  async function fetchRunDetail(runId) {
    if (expandedRunId === runId) {
      setExpandedRunId(null)
      setRunDetail(null)
      setRunTimeline(null)
      return
    }
    setExpandedRunId(runId)
    setRunDetailLoading(true)
    try {
      const [d, t] = await Promise.allSettled([
        loadJson(`/api/runs/${runId}`),
        loadJson(`/api/runs/${runId}/timeline`),
      ])
      if (d.status === 'fulfilled') setRunDetail(d.value)
      if (t.status === 'fulfilled') {
        const tData = t.value
        setRunTimeline(
          Array.isArray(tData) ? tData : tData.events ?? tData.timeline ?? [],
        )
      }
    } catch {
      setRunDetail(null)
    } finally {
      setRunDetailLoading(false)
    }
  }

  /* ---- Audit chain fetchers ---- */
  const fetchAuditChain = useCallback(async () => {
    setAuditChainLoading(true)
    setAuditChainError(null)
    try {
      const data = await loadJson('/api/openclaw/modifier/ops/audit-chain')
      setAuditChain(
        Array.isArray(data) ? data : data.events ?? data.chain ?? [],
      )
    } catch (err) {
      setAuditChainError(err.message)
    } finally {
      setAuditChainLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'audit-chain') fetchAuditChain()
  }, [activeTab, fetchAuditChain])

  async function handleVerifyChain() {
    setVerifying(true)
    setVerifyResult(null)
    try {
      const data = await loadJson(
        '/api/openclaw/modifier/ops/audit-chain/verify',
      )
      setVerifyResult(data)
    } catch (err) {
      setVerifyResult({ error: err.message })
    } finally {
      setVerifying(false)
    }
  }

  /* ---- Retention fetchers ---- */
  const fetchRetention = useCallback(async () => {
    setRetentionLoading(true)
    setRetentionError(null)
    try {
      const data = await loadJson('/api/openclaw/modifier/ops/retention')
      setRetention(data)
    } catch (err) {
      setRetentionError(err.message)
    } finally {
      setRetentionLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'retention') fetchRetention()
  }, [activeTab, fetchRetention])

  /* ---- Dead-letter fetchers ---- */
  const fetchDeadLetter = useCallback(async () => {
    setDeadLetterLoading(true)
    setDeadLetterError(null)
    try {
      const data = await loadJson('/admin/api/audit/dead-letter?limit=50&offset=0')
      const items = Array.isArray(data) ? data : data.items ?? data.events ?? []
      setDeadLetterItems(items)
    } catch (err) {
      setDeadLetterError(err.message)
    } finally {
      setDeadLetterLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'dead-letter') fetchDeadLetter()
  }, [activeTab, fetchDeadLetter])

  async function handleReplayDeadLetter(eventId) {
    setReplayingId(eventId)
    try {
      await postJson(`/admin/api/audit/dead-letter/${eventId}/replay`, {})
      fetchDeadLetter()
    } catch {
      // refresh anyway
      fetchDeadLetter()
    } finally {
      setReplayingId(null)
    }
  }

  async function handleSetRetention() {
    setRetentionMsg(null)
    try {
      const body = retentionInput.trim() ? JSON.parse(retentionInput) : {}
      const result = await postJson(
        '/api/openclaw/modifier/ops/retention',
        body,
      )
      setRetentionMsg(
        result.message ?? result.status ?? 'Retention policy updated.',
      )
      setRetentionInput('')
      fetchRetention()
    } catch (err) {
      setRetentionMsg(`Failed: ${err.message}`)
    }
  }

  async function handleEnforceRetention() {
    setEnforcing(true)
    setRetentionMsg(null)
    try {
      const result = await postJson(
        '/api/openclaw/modifier/ops/retention/enforce',
        {},
      )
      setRetentionMsg(
        result.message ?? result.status ?? 'Retention enforcement triggered.',
      )
    } catch (err) {
      setRetentionMsg(`Enforcement failed: ${err.message}`)
    } finally {
      setEnforcing(false)
    }
  }

  /* ---- Render helpers ---- */
  const globalError =
    auditError ||
    tracesError ||
    reportsError ||
    runsError ||
    auditChainError ||
    retentionError ||
    traceSearchError ||
    deadLetterError

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Audit + Traces
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Track orchestration and security behavior with audit events, traces,
            and compliance reports.
          </p>

          {/* Error banner */}
          {globalError && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Some data could not be loaded
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                The gateway may be starting up or temporarily unavailable. Try
                refreshing the page.
              </p>
            </div>
          )}

          {/* Tab switcher */}
          <div className="mt-6 flex flex-wrap gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition outline-2 outline-offset-2 outline-orange-500 focus-visible:outline ${
                  activeTab === tab.key
                    ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ================================================================ */}
          {/*  AUDIT EVENTS TAB                                                */}
          {/* ================================================================ */}
          {activeTab === 'audit' && (
            <section id="audit-events" className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                  Audit events
                </h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Filter events..."
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value)}
                    className="rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  />
                  <Button variant="secondary" onClick={() => fetchAudit()}>
                    Search
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleExport}
                    disabled={exporting}
                  >
                    {exporting ? 'Exporting...' : 'Export'}
                  </Button>
                </div>
              </div>

              {/* Schema badges */}
              {schemas && schemas.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {schemas.map((s, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      {s.name ?? s}
                    </span>
                  ))}
                </div>
              )}

              {auditLoading && !auditEvents ? (
                <div className="mt-4">
                  <SkeletonList />
                </div>
              ) : auditEvents && auditEvents.length > 0 ? (
                <>
                  <div className="mt-4 space-y-3">
                    {auditEvents.map((evt, idx) => (
                      <div
                        key={evt.id ?? idx}
                        className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-950 dark:text-white">
                              {evt.type ?? evt.event ?? evt.action ?? 'Event'}
                            </span>
                            {evt.severity && (
                              <Tag
                                color={severityColor(evt.severity)}
                                variant="medium"
                              >
                                {evt.severity.toUpperCase()}
                              </Tag>
                            )}
                          </div>
                          {evt.timestamp && (
                            <span className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                              {new Date(evt.timestamp).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {evt.message && (
                          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            {evt.message}
                          </p>
                        )}
                        {evt.actor && (
                          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                            Actor: {evt.actor}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Cursor pagination */}
                  {auditCursor && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="secondary"
                        onClick={() => fetchAudit(auditCursor)}
                        disabled={auditLoading}
                      >
                        {auditLoading ? 'Loading...' : 'Load more'}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No audit events found.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ================================================================ */}
          {/*  TRACE BROWSER TAB                                               */}
          {/* ================================================================ */}
          {activeTab === 'traces' && (
            <section id="trace-browser" className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Trace browser
              </h2>

              {tracesLoading ? (
                <div className="mt-4">
                  <SkeletonList />
                </div>
              ) : traces && traces.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {traces.map((trace, idx) => (
                    <div key={trace.traceId ?? trace.id ?? idx}>
                      <button
                        onClick={() =>
                          fetchTraceDetail(trace.traceId ?? trace.id)
                        }
                        className="w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-3 text-left transition hover:bg-zinc-50 outline-2 outline-offset-2 outline-orange-500 focus-visible:outline dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-zinc-950 dark:text-white">
                            {trace.name ??
                              trace.traceId ??
                              trace.id ??
                              `Trace ${idx + 1}`}
                          </span>
                          <div className="flex items-center gap-2">
                            {trace.status && (
                              <Tag
                                color={
                                  trace.status === 'ok'
                                    ? 'orange'
                                    : trace.status === 'error'
                                      ? 'rose'
                                      : 'amber'
                                }
                                variant="medium"
                              >
                                {trace.status.toUpperCase()}
                              </Tag>
                            )}
                            {trace.duration != null && (
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {trace.duration}ms
                              </span>
                            )}
                          </div>
                        </div>
                        {trace.service && (
                          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                            {trace.service}
                          </p>
                        )}
                      </button>

                      {/* Expanded trace detail */}
                      {expandedTraceId === (trace.traceId ?? trace.id) && (
                        <div className="ml-4 mt-2 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                          {traceDetailLoading ? (
                            <SkeletonCard />
                          ) : traceDetail ? (
                            <pre className="max-h-64 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                              {JSON.stringify(traceDetail, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              Could not load trace detail.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No traces available.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ================================================================ */}
          {/*  TRACE SEARCH TAB                                                */}
          {/* ================================================================ */}
          {activeTab === 'trace-search' && (
            <section id="trace-search" className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Trace Search
              </h2>

              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="Search query..."
                  value={traceSearchQuery}
                  onChange={(e) => setTraceSearchQuery(e.target.value)}
                  className="rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Service filter..."
                  value={traceSearchService}
                  onChange={(e) => setTraceSearchService(e.target.value)}
                  className="rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                />
                <Button
                  variant="secondary"
                  onClick={handleTraceSearch}
                  disabled={traceSearchLoading}
                >
                  {traceSearchLoading ? 'Searching...' : 'Search'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleTraceExport}
                  disabled={traceExporting}
                >
                  {traceExporting ? 'Exporting...' : 'Export Traces'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleTraceClear}
                  disabled={traceClearing}
                >
                  {traceClearing ? 'Clearing...' : 'Clear All'}
                </Button>
              </div>

              {traceSearchLoading && !traceSearchResults ? (
                <div className="mt-4">
                  <SkeletonList />
                </div>
              ) : traceSearchResults && traceSearchResults.length > 0 ? (
                <div className="mt-4 overflow-auto rounded-2xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-950/5 dark:border-white/5">
                        <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Trace ID
                        </th>
                        <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Service
                        </th>
                        <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Status
                        </th>
                        <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Duration
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-950/5 dark:divide-white/5">
                      {traceSearchResults.map((t, idx) => (
                        <tr key={t.traceId ?? t.id ?? idx}>
                          <td className="px-4 py-2 font-mono text-xs text-zinc-950 dark:text-white">
                            {t.traceId ?? t.id ?? '-'}
                          </td>
                          <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                            {t.service ?? '-'}
                          </td>
                          <td className="px-4 py-2">
                            {t.status && (
                              <Tag
                                color={
                                  t.status === 'ok'
                                    ? 'orange'
                                    : t.status === 'error'
                                      ? 'rose'
                                      : 'amber'
                                }
                                variant="small"
                              >
                                {t.status.toUpperCase()}
                              </Tag>
                            )}
                          </td>
                          <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                            {t.duration != null ? `${t.duration}ms` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : traceSearchResults ? (
                <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No traces match your search.
                  </p>
                </div>
              ) : null}
            </section>
          )}

          {/* ================================================================ */}
          {/*  COMPLIANCE TAB                                                  */}
          {/* ================================================================ */}
          {activeTab === 'compliance' && (
            <section id="compliance" className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                  Compliance
                </h2>
                <Button
                  variant="secondary"
                  onClick={handleGenerateReport}
                  disabled={generatingReport}
                >
                  {generatingReport ? 'Generating...' : 'Generate Report'}
                </Button>
              </div>

              {/* Compliance summary card */}
              {complianceSummary && (
                <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Compliance Summary
                  </span>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {complianceSummary.score != null && (
                      <div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Score
                        </span>
                        <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-white">
                          {complianceSummary.score}%
                        </p>
                      </div>
                    )}
                    {complianceSummary.passing != null && (
                      <div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Passing
                        </span>
                        <p className="mt-1 text-2xl font-semibold text-orange-600">
                          {complianceSummary.passing}
                        </p>
                      </div>
                    )}
                    {complianceSummary.failing != null && (
                      <div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Failing
                        </span>
                        <p className="mt-1 text-2xl font-semibold text-rose-600">
                          {complianceSummary.failing}
                        </p>
                      </div>
                    )}
                  </div>
                  {complianceSummary.status && (
                    <div className="mt-3">
                      <Tag
                        color={
                          complianceSummary.status === 'pass'
                            ? 'orange'
                            : 'rose'
                        }
                        variant="medium"
                      >
                        {complianceSummary.status.toUpperCase()}
                      </Tag>
                    </div>
                  )}
                </div>
              )}

              {reportsLoading ? (
                <div className="mt-4">
                  <SkeletonList />
                </div>
              ) : reports && reports.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {reports.map((report, idx) => (
                    <div
                      key={report.id ?? idx}
                      className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">
                          {report.name ?? report.title ?? `Report ${idx + 1}`}
                        </span>
                        {report.status && (
                          <Tag
                            color={
                              report.status === 'pass'
                                ? 'orange'
                                : report.status === 'fail'
                                  ? 'rose'
                                  : 'amber'
                            }
                            variant="medium"
                          >
                            {report.status.toUpperCase()}
                          </Tag>
                        )}
                      </div>
                      {report.summary && (
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {report.summary}
                        </p>
                      )}
                      {report.generatedAt && (
                        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                          Generated:{' '}
                          {new Date(report.generatedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No compliance reports available.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ================================================================ */}
          {/*  RUNS TAB                                                        */}
          {/* ================================================================ */}
          {activeTab === 'runs' && (
            <section id="runs" className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Runs
              </h2>

              {runsLoading ? (
                <div className="mt-4">
                  <SkeletonList />
                </div>
              ) : runs && runs.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {runs.map((run, idx) => (
                    <div key={run.id ?? run.runId ?? idx}>
                      <button
                        onClick={() =>
                          fetchRunDetail(run.id ?? run.runId)
                        }
                        className="w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-3 text-left transition hover:bg-zinc-50 outline-2 outline-offset-2 outline-orange-500 focus-visible:outline dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-zinc-950 dark:text-white">
                            {run.name ?? run.id ?? run.runId ?? `Run ${idx + 1}`}
                          </span>
                          <div className="flex items-center gap-2">
                            {run.status && (
                              <Tag
                                color={
                                  run.status === 'completed' || run.status === 'success'
                                    ? 'orange'
                                    : run.status === 'failed' || run.status === 'error'
                                      ? 'rose'
                                      : 'amber'
                                }
                                variant="medium"
                              >
                                {run.status.toUpperCase()}
                              </Tag>
                            )}
                            {run.createdAt && (
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {new Date(run.createdAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded run detail + timeline */}
                      {expandedRunId === (run.id ?? run.runId) && (
                        <div className="ml-4 mt-2 space-y-3">
                          {runDetailLoading ? (
                            <SkeletonCard />
                          ) : (
                            <>
                              {runDetail && (
                                <div className="rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                    Run Detail
                                  </span>
                                  <pre className="mt-2 max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                                    {JSON.stringify(runDetail, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {runTimeline && runTimeline.length > 0 && (
                                <div className="rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                    Timeline
                                  </span>
                                  <div className="mt-2 space-y-2">
                                    {runTimeline.map((evt, i) => (
                                      <div
                                        key={i}
                                        className="flex items-center gap-2 border-l-2 border-orange-500 pl-3"
                                      >
                                        <span className="text-xs text-zinc-950 dark:text-white">
                                          {evt.name ?? evt.event ?? evt.step ?? `Step ${i + 1}`}
                                        </span>
                                        {evt.timestamp && (
                                          <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                            {new Date(evt.timestamp).toLocaleString()}
                                          </span>
                                        )}
                                        {evt.status && (
                                          <Tag
                                            color={
                                              evt.status === 'completed'
                                                ? 'orange'
                                                : evt.status === 'error'
                                                  ? 'rose'
                                                  : 'amber'
                                            }
                                            variant="small"
                                          >
                                            {evt.status.toUpperCase()}
                                          </Tag>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No runs found.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ================================================================ */}
          {/*  AUDIT CHAIN TAB                                                 */}
          {/* ================================================================ */}
          {activeTab === 'audit-chain' && (
            <section id="audit-chain" className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                  Audit Chain
                </h2>
                <Button
                  variant="secondary"
                  onClick={handleVerifyChain}
                  disabled={verifying}
                >
                  {verifying ? 'Verifying...' : 'Verify Chain Integrity'}
                </Button>
              </div>

              {verifyResult && (
                <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-950 dark:text-white">
                      Verification Result
                    </span>
                    {verifyResult.error ? (
                      <Tag color="rose" variant="small">
                        ERROR
                      </Tag>
                    ) : verifyResult.valid || verifyResult.integrity === 'ok' ? (
                      <Tag color="orange" variant="small">
                        VALID
                      </Tag>
                    ) : (
                      <Tag color="amber" variant="small">
                        ISSUE
                      </Tag>
                    )}
                  </div>
                  {verifyResult.error ? (
                    <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                      {verifyResult.error}
                    </p>
                  ) : (
                    <pre className="mt-2 max-h-32 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                      {JSON.stringify(verifyResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {auditChainLoading ? (
                <div className="mt-4">
                  <SkeletonList />
                </div>
              ) : auditChain && auditChain.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {auditChain.map((evt, idx) => (
                    <div
                      key={evt.id ?? idx}
                      className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">
                          {evt.type ?? evt.event ?? evt.action ?? `Event ${idx + 1}`}
                        </span>
                        {evt.timestamp && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {new Date(evt.timestamp).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {evt.hash && (
                        <p className="mt-1 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                          Hash: {evt.hash}
                        </p>
                      )}
                      {evt.actor && (
                        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                          Actor: {evt.actor}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No audit chain events found.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ================================================================ */}
          {/*  RETENTION TAB                                                   */}
          {/* ================================================================ */}
          {activeTab === 'retention' && (
            <section id="retention" className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Retention Policy
              </h2>

              {retentionLoading ? (
                <div className="mt-4">
                  <SkeletonCard />
                </div>
              ) : retention ? (
                <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {retention.days != null && (
                      <div>
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Retention Period
                        </span>
                        <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">
                          {retention.days} days
                        </p>
                      </div>
                    )}
                    {retention.policy && (
                      <div>
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Policy
                        </span>
                        <p className="mt-1 text-sm text-zinc-950 dark:text-white">
                          {retention.policy}
                        </p>
                      </div>
                    )}
                    {retention.lastEnforced && (
                      <div>
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Last Enforced
                        </span>
                        <p className="mt-1 text-sm text-zinc-950 dark:text-white">
                          {new Date(retention.lastEnforced).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No retention policy configured.
                  </p>
                </div>
              )}

              {/* Retention actions */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                  Set Retention Policy (JSON)
                </label>
                <textarea
                  className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  rows={3}
                  value={retentionInput}
                  onChange={(e) => setRetentionInput(e.target.value)}
                  placeholder='{"days": 90, "policy": "delete"}'
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="filled" onClick={handleSetRetention}>
                    Set Retention
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleEnforceRetention}
                    disabled={enforcing}
                  >
                    {enforcing ? 'Enforcing...' : 'Enforce Now'}
                  </Button>
                </div>
                {retentionMsg && (
                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {retentionMsg}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* ================================================================ */}
          {/*  DEAD LETTER TAB                                                 */}
          {/* ================================================================ */}
          {activeTab === 'dead-letter' && (
            <section id="dead-letter" className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                  Dead Letter Queue
                </h2>
                <Button variant="secondary" onClick={() => fetchDeadLetter()}>
                  Refresh
                </Button>
              </div>

              {deadLetterLoading && <SkeletonList />}

              {!deadLetterLoading && deadLetterItems && deadLetterItems.length === 0 && (
                <div className="mt-6 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    No dead-letter events
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Failed audit events that could not be persisted will appear here.
                  </p>
                </div>
              )}

              {!deadLetterLoading && deadLetterItems && deadLetterItems.length > 0 && (
                <div className="mt-6 space-y-3">
                  {deadLetterItems.map((item, idx) => {
                    const eventId = item.eventId || item.id || `dl-${idx}`
                    return (
                      <div
                        key={eventId}
                        className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {item.eventType || item.type || 'Unknown Event'}
                            </p>
                            <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                              ID: {eventId}
                              {item.timestamp &&
                                ` · ${new Date(item.timestamp).toLocaleString()}`}
                            </p>
                            {item.error && (
                              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                Error: {item.error}
                              </p>
                            )}
                            {item.summary && (
                              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                {item.summary}
                              </p>
                            )}
                          </div>
                          <Tag color={severityColor(item.severity)}>
                            {item.severity || 'unknown'}
                          </Tag>
                          <Button
                            variant="secondary"
                            disabled={replayingId === eventId}
                            onClick={() => handleReplayDeadLetter(eventId)}
                          >
                            {replayingId === eventId ? 'Replaying...' : 'Replay'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </article>
  )
}
