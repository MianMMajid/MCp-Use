'use client'

import dynamic from 'next/dynamic'
import { SkeletonRows } from '@/components/skeleton'

const ToolRegistryContent = dynamic(() => import('./ToolRegistryContent'), {
  loading: () => <div className="mt-6"><SkeletonRows rows={8} cols={5} /></div>,
})

export default function ToolRegistryPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Tool Registry</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Register, manage, and monitor tools, policies, and execution history.</p>
      <ToolRegistryContent />
    </div>
  )
}
