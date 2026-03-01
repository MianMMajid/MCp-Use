'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Audit events', id: 'audit-events' },
  { title: 'Trace browser', id: 'trace-browser' },
  { title: 'Compliance', id: 'compliance' },
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
  { key: 'compliance', label: 'Compliance' },
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

  // -- Compliance state --
  const [reports, setReports] = useState(null)
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState(null)

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

  /* ---- Compliance fetchers ---- */
  const fetchReports = useCallback(async () => {
    setReportsLoading(true)
    setReportsError(null)
    try {
      const data = await loadJson('/admin/api/compliance/reports')
      setReports(Array.isArray(data) ? data : data.reports ?? [])
    } catch (err) {
      setReportsError(err.message)
    } finally {
      setReportsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'compliance') fetchReports()
  }, [activeTab, fetchReports])

  /* ---- Render helpers ---- */
  const globalError = auditError || tracesError || reportsError

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
          <div className="mt-6 flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
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
                                    ? 'emerald'
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
          {/*  COMPLIANCE TAB                                                  */}
          {/* ================================================================ */}
          {activeTab === 'compliance' && (
            <section id="compliance" className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Compliance reports
              </h2>

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
                                ? 'emerald'
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
        </div>
      </div>
    </article>
  )
}
