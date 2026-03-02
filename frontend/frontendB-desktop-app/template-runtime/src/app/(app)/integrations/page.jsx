'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { SkeletonGrid } from '@/components/skeleton'

const IntegrationsContent = dynamic(() => import('./IntegrationsContent'), {
  loading: () => <div className="mt-6"><SkeletonGrid count={6} /></div>,
})

export default function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Integrations</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Connect and manage external service integrations.</p>
      <Suspense>
        <IntegrationsContent />
      </Suspense>
    </div>
  )
}
