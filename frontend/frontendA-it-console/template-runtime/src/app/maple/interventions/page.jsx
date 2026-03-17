'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'
import {
  mutationLaneColor,
  mutationLaneLabel,
  mutationStatusLabel,
} from '@/lib/maple-workspace/cyber-view-model'

export const sections = [
  { title: 'Summary', id: 'summary' },
  { title: 'Queue', id: 'queue' },
  { title: 'Detail', id: 'detail' },
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

function DetailRow({ label, value }) {
  return (
    <div className="rounded-xl border border-zinc-950/10 p-3 dark:border-white/10">
      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-sm text-zinc-950 dark:text-white">{value || '--'}</p>
    </div>
  )
}

export default function FilesystemInterventionsPage() {
  const [status, setStatus] = useState(null)
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [selected, setSelected] = useState(null)
  const [busyId, setBusyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const selectedItem = useMemo(() => {
    if (selected && selected.planId === selectedId) return selected
    return items.find((item) => item.planId === selectedId) || null
  }, [items, selected, selectedId])

  const fetchData = useCallback(async (focusId = selectedId) => {
    setLoading(true)
    setError('')
    try {
      const [statusRes, listRes] = await Promise.all([
        loadJson('/api/firewall/filesystem/status'),
        loadJson('/api/firewall/filesystem/mutations?limit=100'),
      ])
      const nextItems = Array.isArray(listRes?.items) ? listRes.items : []
      const nextSelectedId = focusId || nextItems[0]?.planId || ''
      setStatus(statusRes)
      setItems(nextItems)
      setSelectedId(nextSelectedId)
      if (nextSelectedId) {
        const detailRes = await loadJson(`/api/firewall/filesystem/mutations/${encodeURIComponent(nextSelectedId)}`)
        setSelected(detailRes?.item || null)
      } else {
        setSelected(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function runAction(id, fn) {
    setBusyId(id)
    setError('')
    try {
      await fn()
      await fetchData(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId('')
    }
  }

  async function handleDecision(item, action) {
    const reason = window.prompt(`${action} reason`, action === 'approve' ? 'Reviewed mutation bundle' : 'Unsafe mutation')
    if (reason == null) return
    await runAction(item.planId, () =>
      sendJson(`/api/firewall/filesystem/mutations/${encodeURIComponent(item.planId)}/decision`, { action, reason }),
    )
  }

  async function handlePromote(item) {
    const reason = window.prompt('Promotion note', 'Promote reviewed mutation bundle')
    if (reason == null) return
    await runAction(item.planId, () =>
      sendJson(`/api/firewall/filesystem/mutations/${encodeURIComponent(item.planId)}/promote`, { reason }),
    )
  }

  async function handleRestore(item) {
    const reason = window.prompt('Restore note', 'Restore archived content')
    if (reason == null) return
    await runAction(item.planId, () =>
      sendJson(`/api/firewall/filesystem/mutations/${encodeURIComponent(item.planId)}/restore`, { reason }),
    )
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-7xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Filesystem Interventions</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Review candidate mutations, approve fork-required bundles, and restore archived content when promotion needs to be rolled back.
              </p>
            </div>
            <Button variant="filled" onClick={() => fetchData()} disabled={loading || Boolean(busyId)}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>
            </div>
          )}

          <section id="summary" className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
            <DetailRow label="Guard mode" value={status?.guard?.mode} />
            <DetailRow label="Pending" value={String(status?.counts?.pending ?? 0)} />
            <DetailRow label="Promoted" value={String(status?.counts?.promoted ?? 0)} />
            <DetailRow label="Classifier" value={status?.classifier?.available ? status?.classifier?.model : 'unavailable'} />
          </section>

          <section id="queue" className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Intervention queue</h2>
              <div className="mt-4 space-y-3">
                {items.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No filesystem mutation plans queued.</p>
                ) : (
                  items.map((item) => (
                    <button
                      key={item.planId}
                      type="button"
                      onClick={() => {
                        setSelectedId(item.planId)
                        setSelected(item)
                        fetchData(item.planId)
                      }}
                      className={`w-full rounded-xl border px-4 py-3 text-left ${
                        selectedId === item.planId ? 'border-zinc-950 dark:border-white' : 'border-zinc-950/10 dark:border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-zinc-950 dark:text-white">{item.taskText || item.planId}</p>
                        <Tag color={mutationLaneColor(item)} variant="medium">{mutationLaneLabel(item)}</Tag>
                      </div>
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {mutationStatusLabel(item)} • {item.plan?.candidatePathCount ?? item.plan?.candidatePaths?.length ?? 0} paths
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div id="detail" className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Detail</h2>
              {!selectedItem ? (
                <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Select a mutation plan to inspect candidate paths, model rationale, and promotion state.</p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Tag color={mutationLaneColor(selectedItem)} variant="medium">{mutationLaneLabel(selectedItem)}</Tag>
                    <Tag color="zinc" variant="medium">{mutationStatusLabel(selectedItem)}</Tag>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{selectedItem.planId}</span>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <DetailRow label="Workspace root" value={selectedItem.workspaceRoot} />
                    <DetailRow label="Source surface" value={selectedItem.sourceSurface} />
                    <DetailRow label="Trace / session" value={`${selectedItem.traceId || '--'} / ${selectedItem.sessionId || '--'}`} />
                    <DetailRow label="Model assessment" value={selectedItem.modelAssessment?.available ? `${selectedItem.modelAssessment?.recommendedLane || 'review'} @ ${selectedItem.modelAssessment?.confidence ?? 0}` : 'unavailable'} />
                  </div>

                  <div className="mt-6 rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                    <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Candidate paths</p>
                    <div className="mt-3 space-y-2">
                      {(selectedItem.plan?.pathClassifications || []).map((entry, index) => (
                        <div key={`${entry.path}-${index}`} className="rounded-lg border border-zinc-950/10 px-3 py-2 dark:border-white/10">
                          <div className="flex flex-wrap items-center gap-2">
                            <Tag color={mutationLaneColor({ lane: entry.classification === 'protected' ? 'hard_deny' : entry.classification === 'user_authored' ? 'fork_required' : 'direct_allow' })} variant="small">
                              {entry.classification}
                            </Tag>
                            <code className="text-xs text-zinc-700 dark:text-zinc-200">{entry.path}</code>
                          </div>
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{(entry.reasons || []).join(', ') || '--'}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Operations</p>
                      <pre className="mt-3 overflow-x-auto text-xs text-zinc-700 dark:text-zinc-200">{JSON.stringify(selectedItem.plan?.operations || [], null, 2)}</pre>
                    </div>
                    <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Fork / promotion</p>
                      <pre className="mt-3 overflow-x-auto text-xs text-zinc-700 dark:text-zinc-200">{JSON.stringify({
                        modelAssessment: selectedItem.modelAssessment,
                        validation: selectedItem.validation,
                        forkResult: selectedItem.forkResult,
                        promotion: selectedItem.promotion,
                      }, null, 2)}</pre>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button variant="secondary" onClick={() => handleDecision(selectedItem, 'approve')} disabled={Boolean(busyId) || selectedItem.status === 'promoted' || selectedItem.status === 'restored'}>
                      Approve
                    </Button>
                    <Button variant="secondary" onClick={() => handleDecision(selectedItem, 'deny')} disabled={Boolean(busyId) || selectedItem.status === 'promoted' || selectedItem.status === 'restored'}>
                      Deny
                    </Button>
                    <Button variant="filled" onClick={() => handlePromote(selectedItem)} disabled={Boolean(busyId) || !['approved', 'direct_ready'].includes(String(selectedItem.status))}>
                      Promote
                    </Button>
                    <Button variant="secondary" onClick={() => handleRestore(selectedItem)} disabled={Boolean(busyId) || selectedItem.status !== 'promoted'}>
                      Restore
                    </Button>
                    <Link className="text-sm text-zinc-600 underline dark:text-zinc-300" href={`/maple/hitl?traceId=${encodeURIComponent(selectedItem.traceId || '')}`}>
                      Open HITL queue
                    </Link>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </article>
  )
}
