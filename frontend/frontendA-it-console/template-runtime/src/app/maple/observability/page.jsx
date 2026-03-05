'use client'

import dynamic from 'next/dynamic'
import { Component, useEffect } from 'react'
import { SkeletonCard, SkeletonList } from '@/components/Skeleton'

export const sections = [
  { title: 'Summary', id: 'obs-summary' },
  { title: 'SLO signals', id: 'slo' },
  { title: 'Audit log', id: 'audit-log' },
  { title: 'SIEM export', id: 'siem' },
  { title: 'Alert webhooks', id: 'alert-webhooks' },
]

class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            This section failed to load.
          </p>
          <button
            className="mt-2 text-xs font-medium text-amber-600 underline dark:text-amber-400"
            onClick={() => this.setState({ hasError: false })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const cardFallback = <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
const listFallback = <div className="mt-4"><SkeletonList /></div>

const ObsSummary = dynamic(() => import('./ObsSummary'), { ssr: false, loading: () => cardFallback })
const ObsSlo = dynamic(() => import('./ObsSlo'), { ssr: false, loading: () => cardFallback })
const ObsAuditLog = dynamic(() => import('./ObsAuditLog'), { ssr: false, loading: () => listFallback })
const ObsWebhooks = dynamic(() => import('./ObsWebhooks'), { ssr: false, loading: () => listFallback })

export default function ObservabilityPage() {
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/observability/orchestrations/audit-log?offset=0&limit=1', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    }).catch(() => {
      // Non-blocking preload for deterministic observability wiring.
    })
    return () => controller.abort()
  }, [])

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Observability & Alerts
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Monitor metrics, SLO signals, audit logs, and manage alert webhooks.
          </p>
          <SectionErrorBoundary><ObsSummary /></SectionErrorBoundary>
          <SectionErrorBoundary><ObsSlo /></SectionErrorBoundary>
          <SectionErrorBoundary><ObsAuditLog /></SectionErrorBoundary>
          <SectionErrorBoundary><ObsWebhooks /></SectionErrorBoundary>
        </div>
      </div>
    </article>
  )
}
