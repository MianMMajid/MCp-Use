'use client'

import dynamic from 'next/dynamic'
import { SkeletonList } from '@/components/Skeleton'

export const sections = [
  { title: 'Tools list', id: 'tools-list' },
  { title: 'Tool policies', id: 'tool-policies' },
  { title: 'Tool executions', id: 'tool-executions' },
  { title: 'CLI console', id: 'cli-console' },
]

const fallback = <div className="mt-4"><SkeletonList /></div>

const ToolsRegistry = dynamic(() => import('./ToolsRegistry'), { loading: () => fallback })
const ToolPolicies = dynamic(() => import('./ToolPolicies'), { loading: () => fallback })
const ToolExecutions = dynamic(() => import('./ToolExecutions'), { loading: () => fallback })
const CliConsole = dynamic(() => import('./CliConsole'), { loading: () => fallback })

export default function ToolsRegistryPage() {
  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Tools Registry & CLI
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Register, manage, and execute tools from the registry and CLI catalog.
          </p>
          <ToolsRegistry />
          <ToolPolicies />
          <ToolExecutions />
          <CliConsole />
        </div>
      </div>
    </article>
  )
}
