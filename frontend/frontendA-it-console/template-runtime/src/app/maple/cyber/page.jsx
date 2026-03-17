'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Status', id: 'status' },
  { title: 'Policies', id: 'policies' },
  { title: 'Download scans', id: 'download-scans' },
  { title: 'Quarantine & Blocks', id: 'quarantine-blocks' },
]

async function loadJson(path) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`${path} -> ${response.status}`)
  return response.json()
}

function scanColor(scan) {
  const verdict = String(scan?.verdict || '').toLowerCase()
  if (scan?.status === 'pending') return 'amber'
  if (scan?.quarantined) return 'amber'
  if (scan?.blocked || verdict === 'malicious') return 'rose'
  if (verdict === 'safe') return 'orange'
  return 'zinc'
}

function boolText(value) {
  return value ? 'true' : 'false'
}

function Card({ title, children }) {
  return (
    <section className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">{title}</h2>
      {children}
    </section>
  )
}

export default function CyberOperationsPage() {
  const [status, setStatus] = useState(null)
  const [policies, setPolicies] = useState(null)
  const [downloads, setDownloads] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    source: '',
    verdict: '',
    provider: '',
    status: '',
    runId: '',
    sessionId: '',
    traceId: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })
      params.set('limit', '100')
      const [statusRes, policyRes, downloadsRes, eventsRes] = await Promise.all([
        loadJson('/api/cyber/status'),
        loadJson('/api/cyber/policies'),
        loadJson(`/api/cyber/downloads?${params.toString()}`),
        loadJson('/api/cyber/events?limit=100'),
      ])
      setStatus(statusRes)
      setPolicies(policyRes)
      setDownloads(Array.isArray(downloadsRes?.items) ? downloadsRes.items : [])
      setEvents(Array.isArray(eventsRes?.items) ? eventsRes.items : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const blockedEvents = useMemo(
    () => events.filter((item) => item?.scan?.blocked || item?.scan?.quarantined || String(item?.eventType || '').includes('URL_BLOCKED')),
    [events],
  )

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-6xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Cyber Operations</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Inspect cyber-proxy health, effective download controls, scan verdicts, and quarantine signals.
              </p>
            </div>
            <Button variant="filled" onClick={fetchData} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>
            </div>
          )}

          <Card title="Status">
            <div id="status" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Context-Wall</p>
                <div className="mt-2 flex items-center gap-2">
                  <Tag color={status?.providers?.contextWall?.reachable ? 'orange' : 'rose'} variant="medium">
                    {status?.providers?.contextWall?.reachable ? 'reachable' : 'degraded'}
                  </Tag>
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{status?.providers?.contextWall?.reason || '--'}</p>
              </div>
              <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Cyber-Proxy</p>
                <div className="mt-2 flex items-center gap-2">
                  <Tag color={status?.providers?.cyberProxy?.reachable ? 'orange' : 'rose'} variant="medium">
                    {status?.providers?.cyberProxy?.reachable ? 'reachable' : 'degraded'}
                  </Tag>
                  <Tag color="zinc" variant="small">{status?.providers?.cyberProxy?.address || 'unconfigured'}</Tag>
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{status?.providers?.cyberProxy?.reason || '--'}</p>
              </div>
              <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Scanning</p>
                <div className="mt-2 flex items-center gap-2">
                  <Tag color={status?.scanning?.degraded ? 'amber' : 'orange'} variant="medium">
                    {status?.scanning?.provider || 'unknown'}
                  </Tag>
                  <Tag color="zinc" variant="small">quarantine={boolText(Boolean(status?.scanning?.quarantineEnabled))}</Tag>
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  blocked={status?.recent?.blockedCount ?? 0} scanned={status?.recent?.scannedCount ?? 0}
                </p>
              </div>
            </div>
          </Card>

          <Card title="Policies">
            <div id="policies" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                <p className="text-sm font-medium text-zinc-950 dark:text-white">Network policy</p>
                <pre className="mt-3 overflow-auto text-xs text-zinc-600 dark:text-zinc-400">
                  {JSON.stringify({
                    allowedDomains: policies?.allowedDomains,
                    blockedDomains: policies?.blockedDomains,
                    toolAllowedDomains: policies?.toolAllowedDomains,
                    allowLocalTargets: policies?.allowLocalTargets,
                    allowedLocalHosts: policies?.allowedLocalHosts,
                  }, null, 2)}
                </pre>
              </div>
              <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                <p className="text-sm font-medium text-zinc-950 dark:text-white">Download policy</p>
                <pre className="mt-3 overflow-auto text-xs text-zinc-600 dark:text-zinc-400">
                  {JSON.stringify({
                    scanProvider: policies?.scanProvider,
                    quarantineEnabled: policies?.quarantineEnabled,
                    maxResponseBytes: policies?.maxResponseBytes,
                    fileDownloadGating: policies?.fileDownloadGating,
                  }, null, 2)}
                </pre>
              </div>
            </div>
          </Card>

          <Card title="Download Scans">
            <div id="download-scans" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
                {[
                  ['source', 'Source'],
                  ['verdict', 'Verdict'],
                  ['provider', 'Provider'],
                  ['status', 'Status'],
                  ['runId', 'Run ID'],
                  ['sessionId', 'Session ID'],
                  ['traceId', 'Trace ID'],
                ].map(([key, label]) => (
                  <input
                    key={key}
                    className="rounded-xl border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    placeholder={label}
                    value={filters[key]}
                    onChange={(event) => setFilters((prev) => ({ ...prev, [key]: event.target.value }))}
                  />
                ))}
              </div>
              <div className="space-y-3">
                {downloads.map((item) => (
                  <div key={item.id} className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">{item.filename || item.id}</span>
                      <Tag color={scanColor(item.scan)} variant="medium">{item.scan?.verdict || item.scan?.status || 'unknown'}</Tag>
                      <Tag color="zinc" variant="small">{item.scan?.provider || 'unknown'}</Tag>
                      <Tag color="zinc" variant="small">{item.source}</Tag>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <p>status={item.scan?.status} blocked={boolText(Boolean(item.scan?.blocked))} quarantined={boolText(Boolean(item.scan?.quarantined))}</p>
                      <p>runId={item.runId || '--'} sessionId={item.sessionId || '--'} traceId={item.traceId || '--'}</p>
                      <p>contentType={item.contentType || '--'} size={item.sizeBytes || 0} createdAt={item.createdAt || '--'}</p>
                      {item.url && <p>url={item.url}</p>}
                      {Array.isArray(item.scan?.reasons) && item.scan.reasons.length > 0 && <p>reasons: {item.scan.reasons.join(' | ')}</p>}
                    </div>
                  </div>
                ))}
                {!loading && downloads.length === 0 && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No download or artifact scan records matched the current filters.</p>
                )}
              </div>
            </div>
          </Card>

          <Card title="Quarantine & Blocks">
            <div id="quarantine-blocks" className="mt-4 space-y-3">
              {blockedEvents.map((item) => (
                <div key={item.id} className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-950 dark:text-white">{item.summary || item.eventType}</span>
                    <Tag color={scanColor(item.scan)} variant="medium">{item.scan?.verdict || item.eventType}</Tag>
                    <Tag color="zinc" variant="small">{item.sourceService || 'unknown'}</Tag>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <p>policyReason={item.policyReason || '--'} severity={item.severity || '--'}</p>
                    <p>traceId={item.traceId || '--'} sessionId={item.sessionId || '--'} runId={item.runId || '--'}</p>
                    {item.url && <p>url={item.url}</p>}
                    {Array.isArray(item.scan?.reasons) && item.scan.reasons.length > 0 && <p>reasons: {item.scan.reasons.join(' | ')}</p>}
                  </div>
                </div>
              ))}
              {!loading && blockedEvents.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No blocked or quarantined incidents in the current cyber event window.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </article>
  )
}

