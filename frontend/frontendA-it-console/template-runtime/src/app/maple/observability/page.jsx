'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Summary', id: 'obs-summary' },
  { title: 'SLO signals', id: 'slo' },
  { title: 'Audit log', id: 'audit-log' },
  { title: 'SIEM export', id: 'siem' },
  { title: 'Alert webhooks', id: 'alert-webhooks' },
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

async function deleteJson(path) {
  const res = await fetch(path, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
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
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ObservabilityPage() {
  // Summary state
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  // SLO state
  const [slo, setSlo] = useState(null)
  const [sloLoading, setSloLoading] = useState(true)

  // Audit log state
  const [auditLog, setAuditLog] = useState(null)
  const [auditLogLoading, setAuditLogLoading] = useState(true)
  const [auditLogCursor, setAuditLogCursor] = useState(null)

  // SIEM state
  const [siemFormat, setSiemFormat] = useState('json')
  const [siemMsg, setSiemMsg] = useState(null)
  const [siemExporting, setSiemExporting] = useState(false)
  const [flushing, setFlushing] = useState(false)

  // Org RBAC state
  const [orgRbac, setOrgRbac] = useState(null)

  // Alert webhooks state
  const [webhooks, setWebhooks] = useState(null)
  const [webhooksLoading, setWebhooksLoading] = useState(true)
  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [webhookInput, setWebhookInput] = useState('')
  const [webhookMsg, setWebhookMsg] = useState(null)
  const [expandedWebhookId, setExpandedWebhookId] = useState(null)
  const [deliveries, setDeliveries] = useState(null)
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)

  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setSummaryLoading(true)
    setSloLoading(true)
    setAuditLogLoading(true)
    setWebhooksLoading(true)
    setError(null)
    try {
      const [s, sl, al, org, wh] = await Promise.allSettled([
        loadJson('/api/openclaw/modifier/observability/summary'),
        loadJson('/api/openclaw/modifier/observability/slo'),
        loadJson('/api/openclaw/modifier/observability/audit-log'),
        loadJson('/api/openclaw/modifier/observability/org'),
        loadJson('/api/openclaw/modifier/ops/alert-webhooks'),
      ])

      if (s.status === 'fulfilled') setSummary(s.value)
      if (sl.status === 'fulfilled') setSlo(sl.value)
      if (al.status === 'fulfilled') {
        const data = al.value
        setAuditLog(
          Array.isArray(data) ? data : data.entries ?? data.events ?? data.items ?? [],
        )
        setAuditLogCursor(data.nextCursor ?? data.cursor ?? null)
      }
      if (org.status === 'fulfilled') setOrgRbac(org.value)
      if (wh.status === 'fulfilled') {
        const data = wh.value
        setWebhooks(
          Array.isArray(data) ? data : data.webhooks ?? data.items ?? [],
        )
      }

      if ([s, sl, al, org, wh].every((r) => r.status === 'rejected'))
        throw new Error('All endpoints failed')
    } catch (err) {
      setError(err.message)
    } finally {
      setSummaryLoading(false)
      setSloLoading(false)
      setAuditLogLoading(false)
      setWebhooksLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* -- Audit log pagination -- */
  async function loadMoreAuditLog() {
    if (!auditLogCursor) return
    setAuditLogLoading(true)
    try {
      const data = await loadJson(
        `/api/openclaw/modifier/observability/audit-log?cursor=${auditLogCursor}`,
      )
      const entries = Array.isArray(data)
        ? data
        : data.entries ?? data.events ?? data.items ?? []
      setAuditLog((prev) => (prev ? [...prev, ...entries] : entries))
      setAuditLogCursor(data.nextCursor ?? data.cursor ?? null)
    } catch {
      // non-critical
    } finally {
      setAuditLogLoading(false)
    }
  }

  /* -- SIEM handlers -- */
  async function handleSiemExport() {
    setSiemExporting(true)
    setSiemMsg(null)
    try {
      const result = await postJson(
        '/api/openclaw/modifier/observability/siem-export',
        { format: siemFormat },
      )
      setSiemMsg(result.message ?? result.status ?? 'SIEM export triggered.')
    } catch (err) {
      setSiemMsg(`Export failed: ${err.message}`)
    } finally {
      setSiemExporting(false)
    }
  }

  async function handleFlush() {
    setFlushing(true)
    setSiemMsg(null)
    try {
      const result = await postJson(
        '/api/openclaw/modifier/observability/flush',
        {},
      )
      setSiemMsg(result.message ?? result.status ?? 'Outbox flushed.')
    } catch (err) {
      setSiemMsg(`Flush failed: ${err.message}`)
    } finally {
      setFlushing(false)
    }
  }

  /* -- Webhook handlers -- */
  async function handleAddWebhook() {
    setWebhookMsg(null)
    try {
      const body = webhookInput.trim() ? JSON.parse(webhookInput) : {}
      await postJson('/api/openclaw/modifier/ops/alert-webhooks', body)
      setWebhookMsg('Webhook registered.')
      setWebhookInput('')
      setShowWebhookForm(false)
      fetchData()
    } catch (err) {
      setWebhookMsg(`Failed: ${err.message}`)
    }
  }

  async function handleDeleteWebhook(id) {
    try {
      await deleteJson(`/api/openclaw/modifier/ops/alert-webhooks/${id}`)
      fetchData()
    } catch (err) {
      setWebhookMsg(`Delete failed: ${err.message}`)
    }
  }

  async function handleViewDeliveries(id) {
    if (expandedWebhookId === id) {
      setExpandedWebhookId(null)
      setDeliveries(null)
      return
    }
    setExpandedWebhookId(id)
    setDeliveriesLoading(true)
    try {
      const data = await loadJson(
        `/api/openclaw/modifier/ops/alert-webhooks/${id}/deliveries`,
      )
      setDeliveries(
        Array.isArray(data) ? data : data.deliveries ?? data.items ?? [],
      )
    } catch {
      setDeliveries(null)
    } finally {
      setDeliveriesLoading(false)
    }
  }

  /* -- Render summary metrics -- */
  function renderMetric(label, value) {
    if (value == null) return null
    return (
      <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">
          {typeof value === 'number' ? value.toLocaleString() : String(value)}
        </p>
      </div>
    )
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
                Observability & Alerts
              </h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Monitor metrics, SLO signals, audit logs, and manage alert
                webhooks.
              </p>
            </div>
            <Button variant="secondary" onClick={fetchData}>
              Refresh
            </Button>
          </div>

          {/* Error banner */}
          {error && (
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

          {/* ---- Summary Metrics ---- */}
          <section id="obs-summary" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Overview Metrics
            </h2>

            {summaryLoading && !summary ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : summary ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {renderMetric(
                  'Total Requests',
                  summary.totalRequests ?? summary.requests,
                )}
                {renderMetric(
                  'Error Rate',
                  summary.errorRate != null
                    ? `${(summary.errorRate * 100).toFixed(1)}%`
                    : summary.errors,
                )}
                {renderMetric(
                  'Avg Latency',
                  summary.avgLatency != null
                    ? `${summary.avgLatency}ms`
                    : summary.latency,
                )}
                {renderMetric('Active Sessions', summary.activeSessions)}
                {renderMetric('Uptime', summary.uptime)}
                {/* Fallback for unknown shape */}
                {!summary.totalRequests &&
                  !summary.requests &&
                  !summary.errorRate &&
                  !summary.avgLatency &&
                  Object.entries(summary).map(([k, v]) =>
                    renderMetric(k, v),
                  )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Summary metrics not available.
                </p>
              </div>
            )}

            {/* Org RBAC introspection */}
            {orgRbac && (
              <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Org RBAC Introspection
                </span>
                <pre className="mt-2 max-h-32 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                  {JSON.stringify(orgRbac, null, 2)}
                </pre>
              </div>
            )}
          </section>

          {/* ---- SLO Signals ---- */}
          <section id="slo" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              SLO Signals
            </h2>

            {sloLoading && !slo ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : slo ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {(Array.isArray(slo) ? slo : slo.signals ?? [slo]).map(
                  (signal, idx) => (
                    <div
                      key={signal.name ?? idx}
                      className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900"
                    >
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {signal.name ?? `SLO ${idx + 1}`}
                      </span>
                      {signal.value != null && (
                        <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">
                          {typeof signal.value === 'number'
                            ? `${(signal.value * 100).toFixed(2)}%`
                            : signal.value}
                        </p>
                      )}
                      {signal.target != null && (
                        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                          Target:{' '}
                          {typeof signal.target === 'number'
                            ? `${(signal.target * 100).toFixed(2)}%`
                            : signal.target}
                        </p>
                      )}
                      {signal.status && (
                        <Tag
                          color={
                            signal.status === 'met' || signal.status === 'ok'
                              ? 'orange'
                              : 'rose'
                          }
                          variant="small"
                        >
                          {signal.status.toUpperCase()}
                        </Tag>
                      )}
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  SLO signals not available.
                </p>
              </div>
            )}
          </section>

          {/* ---- Audit Log ---- */}
          <section id="audit-log" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Audit Log
            </h2>

            {auditLogLoading && !auditLog ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : auditLog && auditLog.length > 0 ? (
              <>
                <div className="mt-4 overflow-auto rounded-2xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-950/5 dark:border-white/5">
                        <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Event
                        </th>
                        <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Actor
                        </th>
                        <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Timestamp
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-950/5 dark:divide-white/5">
                      {auditLog.map((entry, idx) => (
                        <tr key={entry.id ?? idx}>
                          <td className="px-4 py-2 font-medium text-zinc-950 dark:text-white">
                            {entry.event ??
                              entry.type ??
                              entry.action ??
                              `Entry ${idx + 1}`}
                          </td>
                          <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                            {entry.actor ?? '-'}
                          </td>
                          <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                            {entry.timestamp
                              ? new Date(entry.timestamp).toLocaleString()
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {auditLogCursor && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="secondary"
                      onClick={loadMoreAuditLog}
                      disabled={auditLogLoading}
                    >
                      {auditLogLoading ? 'Loading...' : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No audit log entries.
                </p>
              </div>
            )}
          </section>

          {/* ---- SIEM Export ---- */}
          <section id="siem" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              SIEM Export
            </h2>

            <div className="mt-4 flex items-center gap-3">
              <select
                value={siemFormat}
                onChange={(e) => setSiemFormat(e.target.value)}
                className="rounded-lg border border-zinc-950/10 bg-white px-3 py-1.5 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
              >
                <option value="json">JSON</option>
                <option value="cef">CEF</option>
                <option value="syslog">Syslog</option>
              </select>
              <Button
                variant="filled"
                onClick={handleSiemExport}
                disabled={siemExporting}
              >
                {siemExporting ? 'Exporting...' : 'Export to SIEM'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleFlush}
                disabled={flushing}
              >
                {flushing ? 'Flushing...' : 'Flush Outbox'}
              </Button>
            </div>

            {siemMsg && (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                {siemMsg}
              </p>
            )}
          </section>

          {/* ---- Alert Webhooks ---- */}
          <section id="alert-webhooks" className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Alert Webhooks
              </h2>
              <Button
                variant="secondary"
                onClick={() => setShowWebhookForm(!showWebhookForm)}
              >
                Add Webhook
              </Button>
            </div>

            {showWebhookForm && (
              <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                  Webhook Configuration (JSON)
                </label>
                <textarea
                  className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  rows={3}
                  value={webhookInput}
                  onChange={(e) => setWebhookInput(e.target.value)}
                  placeholder='{"url": "https://...", "events": ["alert.*"]}'
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="filled" onClick={handleAddWebhook}>
                    Register
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowWebhookForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {webhookMsg && (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                {webhookMsg}
              </p>
            )}

            {webhooksLoading && !webhooks ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : webhooks && webhooks.length > 0 ? (
              <div className="mt-4 space-y-3">
                {webhooks.map((wh, idx) => (
                  <div key={wh.id ?? idx}>
                    <div className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                      <div>
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">
                          {wh.url ?? wh.name ?? wh.id ?? `Webhook ${idx + 1}`}
                        </span>
                        {wh.status && (
                          <Tag
                            color={
                              wh.status === 'active' ? 'orange' : 'zinc'
                            }
                            variant="small"
                          >
                            {wh.status.toUpperCase()}
                          </Tag>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          onClick={() => handleViewDeliveries(wh.id)}
                        >
                          Deliveries
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleDeleteWebhook(wh.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>

                    {/* Expanded deliveries */}
                    {expandedWebhookId === wh.id && (
                      <div className="ml-4 mt-2 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                        {deliveriesLoading ? (
                          <SkeletonList />
                        ) : deliveries && deliveries.length > 0 ? (
                          <div className="space-y-2">
                            {deliveries.map((d, i) => (
                              <div
                                key={d.id ?? i}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-zinc-950 dark:text-white">
                                  {d.event ?? d.type ?? `Delivery ${i + 1}`}
                                </span>
                                <div className="flex items-center gap-2">
                                  {d.statusCode && (
                                    <Tag
                                      color={
                                        d.statusCode >= 200 &&
                                        d.statusCode < 300
                                          ? 'orange'
                                          : 'rose'
                                      }
                                      variant="small"
                                    >
                                      {d.statusCode}
                                    </Tag>
                                  )}
                                  {d.timestamp && (
                                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                      {new Date(d.timestamp).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            No delivery history.
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
                  No alert webhooks configured.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
