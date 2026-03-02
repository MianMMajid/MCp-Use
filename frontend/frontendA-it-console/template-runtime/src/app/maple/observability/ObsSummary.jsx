'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { SkeletonCard } from '@/components/Skeleton'

function renderMetric(label, value) {
  if (value == null) return null
  return (
    <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">
        {typeof value === 'number' ? value.toLocaleString() : String(value)}
      </p>
    </div>
  )
}

export default function ObsSummary({ onRefresh }) {
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [orgRbac, setOrgRbac] = useState(null)

  const fetchData = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const [s, org] = await Promise.allSettled([
        loadJson('/api/openclaw/modifier/observability/summary'),
        loadJson('/api/openclaw/modifier/observability/org'),
      ])
      if (s.status === 'fulfilled') setSummary(s.value)
      if (org.status === 'fulfilled') setOrgRbac(org.value)
    } catch { /* non-critical */ }
    finally { setSummaryLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <section id="obs-summary" className="mt-8">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Overview Metrics</h2>

      {summaryLoading && !summary ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      ) : summary ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {renderMetric('Total Requests', summary.totalRequests ?? summary.requests)}
          {renderMetric('Error Rate', summary.errorRate != null ? `${(summary.errorRate * 100).toFixed(1)}%` : summary.errors)}
          {renderMetric('Avg Latency', summary.avgLatency != null ? `${summary.avgLatency}ms` : summary.latency)}
          {renderMetric('Active Sessions', summary.activeSessions)}
          {renderMetric('Uptime', summary.uptime)}
          {!summary.totalRequests && !summary.requests && !summary.errorRate && !summary.avgLatency && Object.entries(summary).map(([k, v]) => renderMetric(k, v))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Summary metrics not available.</p>
        </div>
      )}

      {orgRbac && (
        <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Org RBAC Introspection</span>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(orgRbac, null, 2)}</pre>
        </div>
      )}
    </section>
  )
}
