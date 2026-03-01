'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Runs list', id: 'runs-list' },
]

async function loadJson(path) {
  const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

function SkeletonList() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDate(d) {
  if (!d) return '--'
  try { return new Date(d).toLocaleString() } catch { return d }
}

function statusTag(s) {
  if (!s) return 'zinc'
  const v = s.toLowerCase()
  if (v === 'completed' || v === 'success') return 'orange'
  if (v === 'failed' || v === 'error') return 'rose'
  if (v === 'running' || v === 'in_progress') return 'amber'
  return 'zinc'
}

export default function RunsPage() {
  const [runs, setRuns] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadJson('/api/runs')
      setRuns(Array.isArray(data?.runs) ? data.runs : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRuns() }, [fetchRuns])

  async function toggleExpand(runId) {
    if (expanded === runId) { setExpanded(null); setDetail(null); setTimeline(null); return }
    setExpanded(runId)
    setDetailLoading(true)
    try {
      const [d, t] = await Promise.allSettled([
        loadJson(`/api/runs/${runId}`),
        loadJson(`/api/runs/${runId}/timeline`),
      ])
      setDetail(d.status === 'fulfilled' ? d.value : null)
      const tVal = t.status === 'fulfilled' ? t.value : null
      setTimeline(Array.isArray(tVal?.events) ? tVal.events : Array.isArray(tVal) ? tVal : [])
    } catch {
      setDetail(null)
      setTimeline([])
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Runs</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">View agent runs, details, and timelines.</p>
            </div>
            <Button variant="filled" onClick={fetchRuns}>Refresh</Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
            </div>
          )}

          <section id="runs-list" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Runs list</h2>
            {loading ? (
              <div className="mt-4"><SkeletonList /></div>
            ) : runs && runs.length > 0 ? (
              <div className="mt-4 space-y-3">
                {runs.map((run) => {
                  const rid = run.runId || run.id || ''
                  const shortId = typeof rid === 'string' ? rid.substring(0, 12) : String(rid)
                  const st = run.status || 'unknown'
                  return (
                    <div key={rid} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleExpand(rid)} className="font-mono text-sm font-medium text-zinc-950 hover:underline dark:text-white">{shortId}</button>
                          <Tag color={statusTag(st)} variant="medium">{st}</Tag>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                          {run.agentName || run.agent ? <span>{run.agentName || run.agent}</span> : null}
                          <span>{run.duration || '--'}</span>
                          <span>{formatDate(run.startedAt || run.createdAt)}</span>
                        </div>
                      </div>
                      {expanded === rid && (
                        <div className="mt-3 space-y-3">
                          {detailLoading ? (
                            <p className="animate-pulse text-sm text-zinc-500">Loading...</p>
                          ) : (
                            <>
                              {detail && (
                                <div>
                                  <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Detail</h4>
                                  <pre className="mt-1 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{JSON.stringify(detail, null, 2)}</pre>
                                </div>
                              )}
                              {timeline && timeline.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Timeline</h4>
                                  <ul className="mt-1 space-y-1">
                                    {timeline.map((evt, i) => (
                                      <li key={i} className="flex items-center gap-2 text-xs">
                                        <Tag color={statusTag(evt.type || evt.status)} variant="small">{evt.type || evt.event || 'event'}</Tag>
                                        <span className="text-zinc-600 dark:text-zinc-400">{evt.message || evt.description || evt.name || JSON.stringify(evt)}</span>
                                        <span className="ml-auto text-zinc-400">{formatDate(evt.timestamp || evt.at)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No runs found.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
