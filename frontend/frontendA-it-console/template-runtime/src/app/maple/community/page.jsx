'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Stats', id: 'stats' },
  { title: 'Shared traces', id: 'shared-traces' },
]

async function loadJson(path) {
  const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
  )
}

function riskColor(score) {
  if (score == null) return 'zinc'
  if (typeof score === 'string') {
    const s = score.toLowerCase()
    if (s === 'high' || s === 'critical') return 'rose'
    if (s === 'medium') return 'amber'
    return 'orange'
  }
  if (score >= 0.7) return 'rose'
  if (score >= 0.4) return 'amber'
  return 'orange'
}

export default function CommunityPage() {
  const [stats, setStats] = useState(null)
  const [traces, setTraces] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, t] = await Promise.allSettled([
        loadJson('/api/community/stats'),
        loadJson('/api/community/traces'),
      ])
      if (s.status === 'fulfilled') setStats(s.value)
      if (t.status === 'fulfilled') setTraces(Array.isArray(t.value?.traces) ? t.value.traces : Array.isArray(t.value) ? t.value : [])
      if (s.status === 'rejected' && t.status === 'rejected') throw new Error('All endpoints failed')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Community</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">View community statistics and shared traces.</p>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
            </div>
          )}

          <section id="stats" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Stats</h2>
            {loading ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
            ) : stats ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {Object.entries(stats).map(([key, val]) => (
                  <div key={key} className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{key}</span>
                    <p className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">{typeof val === 'number' ? val : String(val)}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section id="shared-traces" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Shared traces</h2>
            {!loading && traces && traces.length > 0 ? (
              <div className="mt-4 space-y-3">
                {traces.map((trace, idx) => (
                  <div key={trace.id || idx} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">{trace.taskLabel || trace.name || '--'}</span>
                      <Tag color={riskColor(trace.riskScore || trace.risk)} variant="medium">{trace.riskScore ?? trace.risk ?? '--'}</Tag>
                    </div>
                    {trace.objective && <p className="mt-1 text-xs text-zinc-500">{trace.objective}</p>}
                    <div className="mt-1 flex gap-3 text-xs text-zinc-400">
                      {trace.stepCount != null && <span>{trace.stepCount} steps</span>}
                      {Array.isArray(trace.tags) && trace.tags.map((t) => (
                        <Tag key={t} color="zinc" variant="small">{t}</Tag>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : !loading ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500">No shared traces yet.</p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </article>
  )
}
