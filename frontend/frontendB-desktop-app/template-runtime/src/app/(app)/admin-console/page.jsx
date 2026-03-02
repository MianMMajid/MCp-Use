'use client'

import dynamic from 'next/dynamic'
import { SkeletonRows } from '@/components/skeleton'

const fallback = <div className="mt-4"><SkeletonRows /></div>

const AdminPolicies = dynamic(() => import('./AdminPolicies'), { loading: () => fallback })
const AdminAudit = dynamic(() => import('./AdminAudit'), { loading: () => fallback })
const AdminApprovals = dynamic(() => import('./AdminApprovals'), { loading: () => fallback })

export default function AdminConsolePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Admin Console</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">System administration — policies, audit, approvals, and dead-letter management.</p>
      <AdminPolicies />
      <AdminAudit />
      <AdminApprovals />
    </div>
  )
}
