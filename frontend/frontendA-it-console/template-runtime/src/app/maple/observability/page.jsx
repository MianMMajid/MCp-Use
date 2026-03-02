'use client'

import dynamic from 'next/dynamic'
import { SkeletonCard, SkeletonList } from '@/components/Skeleton'

export const sections = [
  { title: 'Summary', id: 'obs-summary' },
  { title: 'SLO signals', id: 'slo' },
  { title: 'Audit log', id: 'audit-log' },
  { title: 'SIEM export', id: 'siem' },
  { title: 'Alert webhooks', id: 'alert-webhooks' },
]

const cardFallback = <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
const listFallback = <div className="mt-4"><SkeletonList /></div>

const ObsSummary = dynamic(() => import('./ObsSummary'), { loading: () => cardFallback })
const ObsSlo = dynamic(() => import('./ObsSlo'), { loading: () => cardFallback })
const ObsAuditLog = dynamic(() => import('./ObsAuditLog'), { loading: () => listFallback })
const ObsWebhooks = dynamic(() => import('./ObsWebhooks'), { loading: () => listFallback })

export default function ObservabilityPage() {
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
          <ObsSummary />
          <ObsSlo />
          <ObsAuditLog />
          <ObsWebhooks />
        </div>
      </div>
    </article>
  )
}
