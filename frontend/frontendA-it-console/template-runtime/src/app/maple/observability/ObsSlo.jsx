'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson } from '@/lib/api'
import { Tag } from '@/components/Tag'
import { SkeletonCard } from '@/components/Skeleton'

export default function ObsSlo() {
  const [slo, setSlo] = useState(null)
  const [sloLoading, setSloLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setSloLoading(true)
    try { setSlo(await loadJson('/api/observability/orchestrations/slo')) }
    catch { /* non-critical */ }
    finally { setSloLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <section id="slo" className="mt-10">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">SLO Signals</h2>

      {sloLoading && !slo ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><SkeletonCard /><SkeletonCard /></div>
      ) : slo ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(Array.isArray(slo?.signals) ? slo.signals : Array.isArray(slo) ? slo : [slo]).filter(Boolean).map((signal, idx) => (
            <div key={signal.name ?? idx} className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{signal.name ?? `SLO ${idx + 1}`}</span>
              {signal.value != null && (
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">
                  {typeof signal.value === 'number' && signal.value <= 1
                    ? `${(signal.value * 100).toFixed(2)}%`
                    : typeof signal.value === 'number'
                      ? signal.value.toLocaleString()
                      : signal.value}
                </p>
              )}
              {signal.target != null && (
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  Target: {typeof signal.target === 'number' && signal.target <= 1 ? `${(signal.target * 100).toFixed(2)}%` : signal.target}
                </p>
              )}
              {signal.status && <Tag color={signal.status === 'met' || signal.status === 'ok' ? 'orange' : 'rose'} variant="small">{signal.status.toUpperCase()}</Tag>}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">SLO signals not available.</p>
        </div>
      )}
    </section>
  )
}
