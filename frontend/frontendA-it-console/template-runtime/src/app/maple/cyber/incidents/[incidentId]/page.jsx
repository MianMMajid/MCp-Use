'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

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
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `${path} -> ${response.status}`)
  return payload
}

function scanColor(scan) {
  const verdict = String(scan?.verdict || '').toLowerCase()
  if (scan?.quarantined) return 'amber'
  if (scan?.blocked || verdict === 'malicious') return 'rose'
  if (verdict === 'safe') return 'orange'
  return 'zinc'
}

export default function CyberIncidentDetailPage() {
  const params = useParams()
  const incidentId = Array.isArray(params?.incidentId) ? params.incidentId[0] : params?.incidentId
  const [incident, setIncident] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const fetchIncident = useCallback(async () => {
    if (!incidentId) return
    setLoading(true)
    setError('')
    try {
      const payload = await loadJson(`/api/cyber/incidents/${encodeURIComponent(incidentId)}`)
      setIncident(payload?.incident || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [incidentId])

  useEffect(() => {
    fetchIncident()
  }, [fetchIncident])

  async function mutate(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await fetchIncident()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleAssign() {
    const ownerId = window.prompt('Assign incident to owner', incident?.ownerId || 'secops')
    if (ownerId == null) return
    await mutate(() => sendJson(`/api/cyber/incidents/${encodeURIComponent(incidentId)}/assign`, { ownerId }))
  }

  async function handleStateChange() {
    const state = window.prompt('New incident state', incident?.state || 'triaged')
    if (!state) return
    await mutate(() => sendJson(`/api/cyber/incidents/${encodeURIComponent(incidentId)}/state`, { state }))
  }

  async function handleNote() {
    const note = window.prompt('Add investigation note')
    if (!note) return
    await mutate(() => sendJson(`/api/cyber/incidents/${encodeURIComponent(incidentId)}/note`, { note }))
  }

  return (
    <article className="mx-auto max-w-5xl px-6 pt-16 pb-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/maple/cyber" className="text-sm text-zinc-500 underline dark:text-zinc-400">Back to Cyber Operations</Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            {incident?.title || incidentId || 'Incident'}
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Correlated investigation timeline across evidence, quarantine, and analyst actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleAssign} disabled={busy || loading}>Assign</Button>
          <Button variant="outline" onClick={handleStateChange} disabled={busy || loading}>Change state</Button>
          <Button variant="outline" onClick={handleNote} disabled={busy || loading}>Add note</Button>
          <Button variant="filled" onClick={fetchIncident} disabled={busy || loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>
        </div>
      )}

      {incident && (
        <>
          <section className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color="rose" variant="medium">{incident.severity || 'RISK_SEVERITY_LOW'}</Tag>
              <Tag color="zinc" variant="small">{incident.state || 'new'}</Tag>
              <Tag color="zinc" variant="small">{incident.priority || 'medium'}</Tag>
            </div>
            <div className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              <p>{incident.summary || '--'}</p>
              <p>owner={incident.ownerId || '--'} case={incident.linkedCaseId || '--'} escalation={incident.escalationState || '--'}</p>
              <p>traceId={incident.correlation?.traceId || '--'} sessionId={incident.correlation?.sessionId || '--'} runId={incident.correlation?.runId || '--'}</p>
              <p>sha256={incident.correlation?.sha256 || '--'} url={incident.correlation?.url || '--'}</p>
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Evidence</h2>
            <div className="mt-4 space-y-3">
              {(incident.evidence || []).map((item) => (
                <div key={item.evidenceId} className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-950 dark:text-white">{item.filename || item.evidenceId}</span>
                    <Tag color={scanColor(item.scan)} variant="medium">{item.scan?.verdict || item.scan?.status || 'unknown'}</Tag>
                    <Tag color="zinc" variant="small">{item.source}</Tag>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <p>traceId={item.traceId || '--'} sessionId={item.sessionId || '--'} runId={item.runId || '--'}</p>
                    <p>contentType={item.contentType || '--'} size={item.sizeBytes || 0}</p>
                    <p>sha256={item.sha256 || '--'}</p>
                    {Array.isArray(item.scan?.reasons) && item.scan.reasons.length > 0 && <p>reasons: {item.scan.reasons.join(' | ')}</p>}
                  </div>
                </div>
              ))}
              {!loading && (!incident.evidence || incident.evidence.length === 0) && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No evidence is linked to this incident yet.</p>
              )}
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Quarantine</h2>
            <div className="mt-4 space-y-3">
              {(incident.quarantine || []).map((item) => (
                <div key={item.quarantineId} className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-950 dark:text-white">{item.quarantineId}</span>
                    <Tag color={item.currentState === 'released' ? 'orange' : 'amber'} variant="medium">{item.currentState || 'pending_review'}</Tag>
                    <Tag color="zinc" variant="small">{item.reviewStatus || 'pending'}</Tag>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <p>classification={item.classification || '--'} reviewedBy={item.reviewedBy || '--'}</p>
                    <p>storagePath={item.storagePath || '--'}</p>
                  </div>
                </div>
              ))}
              {!loading && (!incident.quarantine || incident.quarantine.length === 0) && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No quarantine object is attached to this incident.</p>
              )}
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Timeline</h2>
            <div className="mt-4 space-y-3">
              {(incident.timeline || []).map((item) => (
                <div key={item.actionId} className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag color="zinc" variant="small">{item.actionType}</Tag>
                    <span className="text-sm text-zinc-950 dark:text-white">{item.summary || item.actionId}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <p>actor={item.actorId || '--'} createdAt={item.createdAt || '--'}</p>
                    {item.payload && <pre className="overflow-auto">{JSON.stringify(item.payload, null, 2)}</pre>}
                  </div>
                </div>
              ))}
              {!loading && (!incident.timeline || incident.timeline.length === 0) && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No analyst timeline entries are recorded yet.</p>
              )}
            </div>
          </section>
        </>
      )}
    </article>
  )
}
