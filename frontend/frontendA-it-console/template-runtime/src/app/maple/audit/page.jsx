'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Audit events', id: 'audit-events' },
  { title: 'Audit chain', id: 'audit-chain' },
  { title: 'Retention', id: 'retention' },
  { title: 'Dead letter', id: 'dead-letter' },
]

const TABS = [
  { key: 'audit', label: 'Audit Events' },
  { key: 'audit-chain', label: 'Audit Chain' },
  { key: 'retention', label: 'Retention' },
  { key: 'dead-letter', label: 'Dead Letter' },
]

async function loadJson(path) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`${path} -> ${response.status}`)
  return response.json()
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${path} -> ${response.status}`)
  return response.json()
}

function severityColor(value) {
  const severity = String(value || '').toLowerCase()
  if (severity === 'critical' || severity === 'error') return 'rose'
  if (severity === 'warning' || severity === 'warn') return 'amber'
  if (severity === 'info') return 'sky'
  return 'zinc'
}

export default function AuditPage() {
  const [activeTab, setActiveTab] = useState('audit')
  const [globalError, setGlobalError] = useState('')

  const [auditEvents, setAuditEvents] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditStatusFilter, setAuditStatusFilter] = useState('')
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditNextOffset, setAuditNextOffset] = useState(null)
  const [exportFormat, setExportFormat] = useState('json')
  const [exporting, setExporting] = useState(false)
  const [forkExecutionId, setForkExecutionId] = useState('')
  const [forkFromSequence, setForkFromSequence] = useState('0')
  const [forkLaunchMode, setForkLaunchMode] = useState('dry_run')
  const [forkEditsInput, setForkEditsInput] = useState('[]')
  const [forking, setForking] = useState(false)
  const [forkResult, setForkResult] = useState(null)

  const [auditChain, setAuditChain] = useState([])
  const [auditChainLoading, setAuditChainLoading] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)
  const [verifying, setVerifying] = useState(false)

  const [retention, setRetention] = useState(null)
  const [retentionLoading, setRetentionLoading] = useState(false)
  const [retentionInput, setRetentionInput] = useState('90')
  const [retentionMessage, setRetentionMessage] = useState('')
  const [enforcing, setEnforcing] = useState(false)

  const [deadLetter, setDeadLetter] = useState([])
  const [deadLetterLoading, setDeadLetterLoading] = useState(false)
  const [replayingId, setReplayingId] = useState('')

  const fetchAudit = useCallback(async (offset = 0, append = false) => {
    setAuditLoading(true)
    setGlobalError('')
    try {
      const params = new URLSearchParams()
      params.set('offset', String(offset))
      params.set('limit', '100')
      if (auditStatusFilter) params.set('status', auditStatusFilter)
      const data = await loadJson(`/api/observability/orchestrations/audit-log?${params.toString()}`)
      const items = Array.isArray(data?.items) ? data.items : []
      setAuditEvents((prev) => (append ? [...prev, ...items] : items))
      setAuditOffset(data.offset ?? offset)
      setAuditNextOffset(data.nextOffset ?? null)
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : String(error))
    } finally {
      setAuditLoading(false)
    }
  }, [auditStatusFilter])

  const fetchAuditChain = useCallback(async () => {
    setAuditChainLoading(true)
    setGlobalError('')
    try {
      const data = await loadJson('/api/observability/orchestrations/audit-chain?offset=0&limit=200')
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data?.events) ? data.events : []
      setAuditChain(items)
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : String(error))
    } finally {
      setAuditChainLoading(false)
    }
  }, [])

  const fetchRetention = useCallback(async () => {
    setRetentionLoading(true)
    setGlobalError('')
    try {
      const data = await loadJson('/api/observability/orchestrations/retention')
      setRetention(data)
      if (data?.retentionDays != null) setRetentionInput(String(data.retentionDays))
      if (data?.days != null) setRetentionInput(String(data.days))
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : String(error))
    } finally {
      setRetentionLoading(false)
    }
  }, [])

  const fetchDeadLetter = useCallback(async () => {
    setDeadLetterLoading(true)
    setGlobalError('')
    try {
      const data = await loadJson('/api/observability/orchestrations/dead-letter?offset=0&limit=200')
      setDeadLetter(Array.isArray(data?.items) ? data.items : [])
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : String(error))
    } finally {
      setDeadLetterLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'audit') fetchAudit(0, false).catch(() => {})
    if (activeTab === 'audit-chain') fetchAuditChain().catch(() => {})
    if (activeTab === 'retention') fetchRetention().catch(() => {})
    if (activeTab === 'dead-letter') fetchDeadLetter().catch(() => {})
  }, [activeTab, fetchAudit, fetchAuditChain, fetchRetention, fetchDeadLetter])

  async function handleExport() {
    setExporting(true)
    try {
      const response = await fetch('/api/observability/orchestrations/export', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: exportFormat }),
      })
      if (!response.ok) throw new Error(`/api/observability/orchestrations/export -> ${response.status}`)
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const payload = await response.json()
        setGlobalError(`Export generated: ${payload.total ?? payload.items?.length ?? 0} events.`)
      } else {
        const payload = await response.text()
        const lines = payload.split('\n').filter(Boolean).length
        setGlobalError(`Export generated (${exportFormat}) with ${lines} lines.`)
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : String(error))
    } finally {
      setExporting(false)
    }
  }

  async function handleFlushOutbox() {
    try {
      const result = await postJson('/api/observability/orchestrations/flush', {})
      setGlobalError(result?.ok ? 'Outbox flush completed.' : 'Outbox flush requested.')
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleForkExecution() {
    if (!forkExecutionId.trim()) {
      setGlobalError('Execution ID is required to fork.')
      return
    }
    setForking(true)
    setForkResult(null)
    setGlobalError('')
    try {
      const parsedSequence = Number.parseInt(forkFromSequence, 10)
      const edits = forkEditsInput.trim() ? JSON.parse(forkEditsInput) : []
      const result = await postJson(
        `/api/observability/orchestrations/executions/${forkExecutionId.trim()}/fork`,
        {
          forkFromSequence: Number.isFinite(parsedSequence) ? parsedSequence : 0,
          edits: Array.isArray(edits) ? edits : [],
          launchMode: forkLaunchMode,
          waitForExecution: false,
        },
      )
      setForkResult(result)
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : String(error))
    } finally {
      setForking(false)
    }
  }

  async function handleVerifyChain() {
    setVerifying(true)
    setVerifyResult(null)
    try {
      setVerifyResult(await loadJson('/api/observability/orchestrations/audit-chain/verify'))
    } catch (error) {
      setVerifyResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setVerifying(false)
    }
  }

  async function handleSetRetention() {
    setRetentionMessage('')
    try {
      const parsed = Number.parseInt(retentionInput, 10)
      const payload = Number.isFinite(parsed) ? { retentionDays: parsed } : {}
      const result = await postJson('/api/observability/orchestrations/retention', payload)
      setRetentionMessage(result?.ok ? 'Retention updated.' : 'Retention update submitted.')
      fetchRetention().catch(() => {})
    } catch (error) {
      setRetentionMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleEnforceRetention() {
    setEnforcing(true)
    setRetentionMessage('')
    try {
      const result = await postJson('/api/observability/orchestrations/retention/enforce', {})
      setRetentionMessage(result?.ok ? 'Retention enforcement completed.' : 'Retention enforcement requested.')
      fetchRetention().catch(() => {})
    } catch (error) {
      setRetentionMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setEnforcing(false)
    }
  }

  async function handleReplayDeadLetter(eventId) {
    setReplayingId(eventId)
    try {
      await postJson(`/api/observability/orchestrations/dead-letter/${eventId}/replay`, {})
      fetchDeadLetter().catch(() => {})
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : String(error))
    } finally {
      setReplayingId('')
    }
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Audit & Compliance Operations
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Canonical operations for audit events, chain verification, retention policy, and dead-letter replay.
          </p>

          {globalError && (
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950/40">
              <p className="text-sm text-sky-800 dark:text-sky-300">{globalError}</p>
            </div>
          )}

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

          {activeTab === 'audit' && (
            <section id="audit-events" className="mt-8">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="status filter"
                  value={auditStatusFilter}
                  onChange={(event) => setAuditStatusFilter(event.target.value)}
                  className="rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                />
                <Button variant="secondary" onClick={() => fetchAudit(0, false)} disabled={auditLoading}>
                  {auditLoading ? 'Loading...' : 'Search'}
                </Button>
                <select
                  value={exportFormat}
                  onChange={(event) => setExportFormat(event.target.value)}
                  className="rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                >
                  <option value="json">json</option>
                  <option value="ndjson">ndjson</option>
                  <option value="cef">cef</option>
                  <option value="syslog">syslog</option>
                </select>
                <Button variant="secondary" onClick={handleExport} disabled={exporting}>
                  {exporting ? 'Exporting...' : 'Export'}
                </Button>
                <Button variant="secondary" onClick={handleFlushOutbox}>
                  Flush Outbox
                </Button>
              </div>

              <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-3 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Fork Investigation</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="execution id"
                    value={forkExecutionId}
                    onChange={(event) => setForkExecutionId(event.target.value)}
                    className="min-w-56 rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  />
                  <input
                    type="number"
                    placeholder="fork seq"
                    value={forkFromSequence}
                    onChange={(event) => setForkFromSequence(event.target.value)}
                    className="w-28 rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  />
                  <select
                    value={forkLaunchMode}
                    onChange={(event) => setForkLaunchMode(event.target.value)}
                    className="rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  >
                    <option value="dry_run">dry_run</option>
                    <option value="live">live</option>
                  </select>
                  <Button variant="secondary" onClick={handleForkExecution} disabled={forking}>
                    {forking ? 'Forking...' : 'Fork Execution'}
                  </Button>
                </div>
                <textarea
                  value={forkEditsInput}
                  onChange={(event) => setForkEditsInput(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-xs text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  placeholder='[{"op":"spawn_agent","agentId":"agent-alpha"}]'
                />
                {forkResult && (
                  <pre className="mt-2 overflow-auto rounded-lg border border-zinc-950/10 bg-white p-2 text-xs dark:border-white/10 dark:bg-zinc-950">
                    {JSON.stringify(forkResult, null, 2)}
                  </pre>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {auditEvents.map((event, idx) => (
                  <div key={event.id || idx} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">
                          {event.event?.eventType || event.eventType || event.type || 'event'}
                        </span>
                        <Tag color={severityColor(event.event?.severity || event.severity)} variant="medium">
                          {String(event.event?.severity || event.severity || 'info').toUpperCase()}
                        </Tag>
                      </div>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(event.createdAt || event.timestamp || Date.now()).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {event.event?.summary || event.summary || event.status || '--'}
                    </p>
                  </div>
                ))}
                {auditEvents.length === 0 && !auditLoading && (
                  <div className="rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No audit events found.</p>
                  </div>
                )}
                {auditNextOffset != null && (
                  <div className="flex justify-center">
                    <Button variant="secondary" onClick={() => fetchAudit(auditNextOffset, true)} disabled={auditLoading}>
                      {auditLoading ? 'Loading...' : 'Load more'}
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'audit-chain' && (
            <section id="audit-chain" className="mt-8">
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={fetchAuditChain} disabled={auditChainLoading}>
                  {auditChainLoading ? 'Loading...' : 'Refresh Chain'}
                </Button>
                <Button variant="secondary" onClick={handleVerifyChain} disabled={verifying}>
                  {verifying ? 'Verifying...' : 'Verify Chain'}
                </Button>
              </div>
              {verifyResult && (
                <div className="mt-3 rounded-lg border border-zinc-950/10 bg-white p-3 text-xs dark:border-white/10 dark:bg-zinc-900">
                  <pre className="overflow-auto">{JSON.stringify(verifyResult, null, 2)}</pre>
                </div>
              )}
              <div className="mt-4 space-y-2">
                {auditChain.map((event, idx) => (
                  <div key={event.id || idx} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 text-xs dark:border-white/10 dark:bg-zinc-900">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {event.eventType || event.event?.eventType || 'event'}
                    </p>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      {new Date(event.timestamp || event.event?.timestamp || Date.now()).toLocaleString()}
                    </p>
                  </div>
                ))}
                {auditChain.length === 0 && !auditChainLoading && (
                  <div className="rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No audit chain entries.</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'retention' && (
            <section id="retention" className="mt-8">
              <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Current retention: {retention?.retentionDays ?? retention?.days ?? '--'} days
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={retentionInput}
                    onChange={(event) => setRetentionInput(event.target.value)}
                    className="w-40 rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                    placeholder="retention days"
                  />
                  <Button variant="secondary" onClick={handleSetRetention}>Save Policy</Button>
                  <Button variant="secondary" onClick={handleEnforceRetention} disabled={enforcing}>
                    {enforcing ? 'Enforcing...' : 'Enforce Now'}
                  </Button>
                </div>
                {retentionMessage && (
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{retentionMessage}</p>
                )}
              </div>
            </section>
          )}

          {activeTab === 'dead-letter' && (
            <section id="dead-letter" className="mt-8">
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={fetchDeadLetter} disabled={deadLetterLoading}>
                  {deadLetterLoading ? 'Loading...' : 'Refresh'}
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {deadLetter.map((entry, idx) => (
                  <div key={entry.outboxId || idx} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-zinc-500">{entry.outboxId || '--'}</span>
                      <Button
                        variant="secondary"
                        onClick={() => handleReplayDeadLetter(entry.outboxId)}
                        disabled={!entry.outboxId || replayingId === entry.outboxId}
                      >
                        {replayingId === entry.outboxId ? 'Replaying...' : 'Replay'}
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      attempts: {entry.attempts ?? 0} · error: {entry.lastError || '--'}
                    </p>
                  </div>
                ))}
                {deadLetter.length === 0 && !deadLetterLoading && (
                  <div className="rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No dead-letter events.</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </article>
  )
}
