'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Status', id: 'status' },
  { title: 'Policies', id: 'policies' },
  { title: 'Incident queue', id: 'incident-queue' },
  { title: 'Download scans', id: 'download-scans' },
  { title: 'Quarantine objects', id: 'quarantine-objects' },
  { title: 'Suppressions', id: 'suppressions' },
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

async function sendJson(path, body = {}) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `${path} -> ${response.status}`)
  }
  return payload
}

function scanColor(scan) {
  const verdict = String(scan?.verdict || '').toLowerCase()
  if (scan?.status === 'pending') return 'amber'
  if (scan?.quarantined) return 'amber'
  if (scan?.blocked || verdict === 'malicious') return 'rose'
  if (verdict === 'safe') return 'orange'
  return 'zinc'
}

function incidentColor(item) {
  const severity = String(item?.severity || '').toLowerCase()
  const state = String(item?.state || '').toLowerCase()
  if (state === 'closed' || state === 'resolved') return 'zinc'
  if (severity.includes('high')) return 'rose'
  if (severity.includes('medium')) return 'amber'
  return 'orange'
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

function keyText(item, key) {
  return item && item[key] ? item[key] : '--'
}

export default function CyberOperationsPage() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState(null)
  const [policies, setPolicies] = useState(null)
  const [downloads, setDownloads] = useState([])
  const [incidents, setIncidents] = useState([])
  const [quarantine, setQuarantine] = useState([])
  const [suppressions, setSuppressions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [filters, setFilters] = useState({
    source: searchParams.get('source') || '',
    verdict: searchParams.get('verdict') || '',
    provider: searchParams.get('provider') || '',
    status: searchParams.get('status') || '',
    runId: searchParams.get('runId') || '',
    sessionId: searchParams.get('sessionId') || '',
    traceId: searchParams.get('traceId') || '',
  })
  const [suppressionDraft, setSuppressionDraft] = useState({
    scopeType: 'sha256',
    scopeValue: '',
    rationale: '',
    rollbackPath: '',
    provider: '',
    tool: '',
    policyRule: '',
    expiresAt: '',
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
      const [statusRes, policyRes, downloadsRes, incidentsRes, quarantineRes, suppressionsRes] = await Promise.all([
        loadJson('/api/cyber/status'),
        loadJson('/api/cyber/policies'),
        loadJson(`/api/cyber/downloads?${params.toString()}`),
        loadJson('/api/cyber/incidents?limit=100'),
        loadJson('/api/cyber/quarantine'),
        loadJson('/api/cyber/suppressions'),
      ])
      setStatus(statusRes)
      setPolicies(policyRes)
      setDownloads(Array.isArray(downloadsRes?.items) ? downloadsRes.items : [])
      setIncidents(Array.isArray(incidentsRes?.items) ? incidentsRes.items : [])
      setQuarantine(Array.isArray(quarantineRes?.items) ? quarantineRes.items : [])
      setSuppressions(Array.isArray(suppressionsRes?.items) ? suppressionsRes.items : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const severeOpenIncidents = useMemo(
    () => incidents.filter((item) => item?.state !== 'closed' && item?.state !== 'resolved' && String(item?.severity || '').includes('HIGH')),
    [incidents],
  )

  async function runAction(id, fn) {
    setBusyId(id)
    setError('')
    try {
      await fn()
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId('')
    }
  }

  async function handleAssign(incident) {
    const ownerId = window.prompt('Assign incident to owner', incident?.ownerId || 'secops')
    if (ownerId == null) return
    await runAction(incident.incidentId, () => sendJson(`/api/cyber/incidents/${encodeURIComponent(incident.incidentId)}/assign`, { ownerId }))
  }

  async function handleStateChange(incident) {
    const state = window.prompt('New incident state', incident?.state || 'triaged')
    if (!state) return
    const disposition = window.prompt('Disposition (optional)', incident?.disposition || '') ?? ''
    await runAction(
      incident.incidentId,
      () => sendJson(`/api/cyber/incidents/${encodeURIComponent(incident.incidentId)}/state`, { state, disposition }),
    )
  }

  async function handleNote(incident) {
    const note = window.prompt('Add incident note')
    if (!note) return
    await runAction(incident.incidentId, () => sendJson(`/api/cyber/incidents/${encodeURIComponent(incident.incidentId)}/note`, { note }))
  }

  async function handleReview(item, reviewStatus) {
    await runAction(item.quarantineId, () => sendJson(`/api/cyber/quarantine/${encodeURIComponent(item.quarantineId)}/review`, { reviewStatus }))
  }

  async function handleRelease(item) {
    const releaseDisposition = window.prompt('Release disposition', 'operator_release')
    if (!releaseDisposition) return
    await runAction(
      item.quarantineId,
      () => sendJson(`/api/cyber/quarantine/${encodeURIComponent(item.quarantineId)}/release`, { releaseDisposition }),
    )
  }

  async function handleRescan(item) {
    await runAction(item.quarantineId, () => sendJson(`/api/cyber/quarantine/${encodeURIComponent(item.quarantineId)}/rescan`, {}))
  }

  async function handleCreateSuppression(event) {
    event.preventDefault()
    if (!suppressionDraft.scopeValue || !suppressionDraft.rationale) return
    await runAction('suppression-create', async () => {
      await sendJson('/api/cyber/suppressions', suppressionDraft)
      setSuppressionDraft((prev) => ({ ...prev, scopeValue: '', rationale: '', rollbackPath: '', expiresAt: '' }))
    })
  }

  async function handleRevokeSuppression(item) {
    await runAction(item.suppressionId, () => sendJson(`/api/cyber/suppressions/${encodeURIComponent(item.suppressionId)}/revoke`, { reason: 'Operator revoke' }))
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-7xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Cyber Operations</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Run the analyst workflow across incidents, evidence, quarantine actions, and suppressions.
              </p>
            </div>
            <Button variant="filled" onClick={fetchData} disabled={loading || Boolean(busyId)}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>
            </div>
          )}

          <Card title="Status">
            <div id="status" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {[
                ['Context-Wall', status?.providers?.contextWall?.reachable, status?.providers?.contextWall?.reason],
                ['Cyber-Proxy', status?.providers?.cyberProxy?.reachable, status?.providers?.cyberProxy?.reason],
                ['MCP-Proxy', status?.providers?.mcpProxy?.reachable, status?.providers?.mcpProxy?.reason],
                ['Evidence Store', status?.security?.evidenceStore?.available, status?.security?.evidenceStore?.mode],
                ['Quarantine Store', status?.security?.quarantineStore?.available, status?.security?.quarantineStore?.storagePath],
                ['Scan Provider', !(status?.scanning?.degraded), status?.scanning?.provider],
              ].map(([label, ok, detail]) => (
                <div key={label} className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Tag color={ok ? 'orange' : 'rose'} variant="medium">{ok ? 'ready' : 'degraded'}</Tag>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{detail || '--'}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Blocked / scanned</p>
                <p className="mt-2 text-sm text-zinc-950 dark:text-white">
                  blocked={status?.recent?.blockedCount ?? 0} scanned={status?.recent?.scannedCount ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Open incidents</p>
                <p className="mt-2 text-sm text-zinc-950 dark:text-white">{status?.security?.incidents?.open ?? 0}</p>
              </div>
              <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Severe open</p>
                <p className="mt-2 text-sm text-zinc-950 dark:text-white">{status?.security?.incidents?.severeOpen ?? severeOpenIncidents.length}</p>
              </div>
              <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Quarantine backlog</p>
                <p className="mt-2 text-sm text-zinc-950 dark:text-white">{status?.security?.quarantineStore?.backlog ?? quarantine.length}</p>
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

          <Card title="Incident Queue">
            <div id="incident-queue" className="mt-4 space-y-3">
              {incidents.map((incident) => (
                <div key={incident.incidentId} className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/maple/cyber/incidents/${encodeURIComponent(incident.incidentId)}`} className="text-sm font-medium text-zinc-950 hover:underline dark:text-white">
                          {incident.title || incident.incidentId}
                        </Link>
                        <Tag color={incidentColor(incident)} variant="medium">{incident.severity || 'RISK_SEVERITY_LOW'}</Tag>
                        <Tag color="zinc" variant="small">{incident.state || 'new'}</Tag>
                        <Tag color="zinc" variant="small">{incident.priority || 'medium'}</Tag>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <p>{incident.summary || '--'}</p>
                        <p>owner={keyText(incident, 'ownerId')} evidence={Array.isArray(incident.evidenceIds) ? incident.evidenceIds.length : 0} case={keyText(incident, 'linkedCaseId')}</p>
                        <p>traceId={keyText(incident.correlation || {}, 'traceId')} sessionId={keyText(incident.correlation || {}, 'sessionId')} runId={keyText(incident.correlation || {}, 'runId')}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => handleAssign(incident)} disabled={busyId === incident.incidentId}>Assign</Button>
                      <Button variant="outline" onClick={() => handleStateChange(incident)} disabled={busyId === incident.incidentId}>Change state</Button>
                      <Button variant="outline" onClick={() => handleNote(incident)} disabled={busyId === incident.incidentId}>Add note</Button>
                    </div>
                  </div>
                </div>
              ))}
              {!loading && incidents.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No incidents are open in the current scope.</p>
              )}
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
                      {item.incidentId && (
                        <Link href={`/maple/cyber/incidents/${encodeURIComponent(item.incidentId)}`} className="text-xs text-zinc-600 underline dark:text-zinc-300">
                          Incident
                        </Link>
                      )}
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

          <Card title="Quarantine Objects">
            <div id="quarantine-objects" className="mt-4 space-y-3">
              {quarantine.map((item) => (
                <div key={item.quarantineId} className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">{item.quarantineId}</span>
                        <Tag color={item.currentState === 'released' ? 'orange' : 'amber'} variant="medium">{item.currentState || 'pending_review'}</Tag>
                        <Tag color="zinc" variant="small">{item.reviewStatus || 'pending'}</Tag>
                        <Tag color="zinc" variant="small">{item.classification || 'unknown'}</Tag>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <p>evidenceId={item.evidenceId || '--'} size={item.sizeBytes || 0} contentType={item.contentType || '--'}</p>
                        <p>reviewedBy={keyText(item, 'reviewedBy')} reviewedAt={keyText(item, 'reviewedAt')}</p>
                        <p>storagePath={keyText(item, 'storagePath')}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => handleReview(item, 'benign')} disabled={busyId === item.quarantineId}>Mark benign</Button>
                      <Button variant="outline" onClick={() => handleReview(item, 'malicious')} disabled={busyId === item.quarantineId}>Mark malicious</Button>
                      <Button variant="outline" onClick={() => handleRescan(item)} disabled={busyId === item.quarantineId}>Re-scan</Button>
                      <Button variant="outline" onClick={() => handleRelease(item)} disabled={busyId === item.quarantineId}>Release</Button>
                    </div>
                  </div>
                </div>
              ))}
              {!loading && quarantine.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No quarantine objects are present in the current scope.</p>
              )}
            </div>
          </Card>

          <Card title="Suppressions">
            <div id="suppressions" className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <div className="space-y-3">
                {suppressions.map((item) => (
                  <div key={item.suppressionId} className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-zinc-950 dark:text-white">{item.scopeType}:{item.scopeValue}</span>
                          <Tag color={item.status === 'active' ? 'orange' : 'zinc'} variant="medium">{item.status || 'active'}</Tag>
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                          <p>rationale={item.rationale || '--'}</p>
                          <p>provider={keyText(item, 'provider')} tool={keyText(item, 'tool')} policyRule={keyText(item, 'policyRule')}</p>
                          <p>approver={keyText(item, 'approver')} createdBy={keyText(item, 'createdBy')} expiresAt={keyText(item, 'expiresAt')}</p>
                        </div>
                      </div>
                      {item.status === 'active' && (
                        <Button variant="outline" onClick={() => handleRevokeSuppression(item)} disabled={busyId === item.suppressionId}>Revoke</Button>
                      )}
                    </div>
                  </div>
                ))}
                {!loading && suppressions.length === 0 && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No active suppressions are configured.</p>
                )}
              </div>
              <form className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10" onSubmit={handleCreateSuppression}>
                <p className="text-sm font-medium text-zinc-950 dark:text-white">Create suppression</p>
                <div className="mt-3 space-y-3">
                  <select
                    className="w-full rounded-xl border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    value={suppressionDraft.scopeType}
                    onChange={(event) => setSuppressionDraft((prev) => ({ ...prev, scopeType: event.target.value }))}
                  >
                    {['sha256', 'domain', 'url_pattern', 'tool', 'provider', 'policy_rule'].map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <input
                    className="w-full rounded-xl border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    placeholder="Scope value"
                    value={suppressionDraft.scopeValue}
                    onChange={(event) => setSuppressionDraft((prev) => ({ ...prev, scopeValue: event.target.value }))}
                  />
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    placeholder="Rationale"
                    value={suppressionDraft.rationale}
                    onChange={(event) => setSuppressionDraft((prev) => ({ ...prev, rationale: event.target.value }))}
                  />
                  <input
                    className="w-full rounded-xl border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    placeholder="Rollback path"
                    value={suppressionDraft.rollbackPath}
                    onChange={(event) => setSuppressionDraft((prev) => ({ ...prev, rollbackPath: event.target.value }))}
                  />
                  <input
                    className="w-full rounded-xl border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    placeholder="Provider (optional)"
                    value={suppressionDraft.provider}
                    onChange={(event) => setSuppressionDraft((prev) => ({ ...prev, provider: event.target.value }))}
                  />
                  <input
                    className="w-full rounded-xl border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    placeholder="Tool (optional)"
                    value={suppressionDraft.tool}
                    onChange={(event) => setSuppressionDraft((prev) => ({ ...prev, tool: event.target.value }))}
                  />
                  <input
                    className="w-full rounded-xl border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    placeholder="Policy rule (optional)"
                    value={suppressionDraft.policyRule}
                    onChange={(event) => setSuppressionDraft((prev) => ({ ...prev, policyRule: event.target.value }))}
                  />
                  <input
                    className="w-full rounded-xl border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    placeholder="Expires at ISO8601 (optional)"
                    value={suppressionDraft.expiresAt}
                    onChange={(event) => setSuppressionDraft((prev) => ({ ...prev, expiresAt: event.target.value }))}
                  />
                  <Button type="submit" variant="filled" disabled={busyId === 'suppression-create'}>Create suppression</Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </article>
  )
}
