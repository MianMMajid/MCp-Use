'use client'

import dynamic from 'next/dynamic'
import { SkeletonCard, SkeletonRows } from '@/components/skeleton'

const ComplianceContent = dynamic(() => import('./ComplianceContent'), {
  loading: () => (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="mt-8"><SkeletonRows rows={5} cols={4} /></div>
    </>
  ),
})

export default function CompliancePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Compliance</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Break-glass operations, audit chain verification, retention policies, and compliance reporting.</p>
      <ComplianceContent />
    </div>
  )
}
