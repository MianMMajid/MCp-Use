'use client'

import dynamic from 'next/dynamic'
import { SkeletonCard, SkeletonRows } from '@/components/skeleton'

const ApprovalsContent = dynamic(() => import('./ApprovalsContent'), {
  loading: () => (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="mt-8"><SkeletonRows rows={6} cols={5} /></div>
    </>
  ),
})

export default function ModifierApprovalsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Modifier Approvals</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Review and manage modifier approval requests, capabilities, and step-up decisions.</p>
      <ApprovalsContent />
    </div>
  )
}
