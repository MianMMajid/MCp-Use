'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson } from '@/lib/api'
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

  const fetchData = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const [s] = await Promise.allSettled([
        loadJson('/api/observability/orchestrations/summary'),
      ])
      if (s.status === 'fulfilled') setSummary(s.value)
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
          {renderMetric('Total Executions', summary.totalExecutions)}
          {renderMetric('Active Executions', summary.activeExecutions)}
          {renderMetric('Pending Approvals', summary.approvalsPending)}
          {renderMetric('Completed', summary.byStatus?.completed)}
          {renderMetric('Failed', summary.byStatus?.failed)}
          {renderMetric('Canceled', summary.byStatus?.canceled)}
          {renderMetric('Audit Pending', summary.outbox?.pending)}
          {renderMetric('Dead Letter', summary.outbox?.deadLetter)}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Summary metrics not available.</p>
        </div>
      )}
    </section>
  )
}
